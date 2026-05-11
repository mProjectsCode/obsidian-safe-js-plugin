import type { HostRpcResponseMessage, SafeJsExecutionOptions, SafeJsExecutionResult } from 'packages/obsidian/src/execution/contracts';
import { workerToHostMessageSchema } from 'packages/obsidian/src/execution/contracts';
import type { WorkerClient, WorkerFactory } from 'packages/obsidian/src/execution/worker-client';
import type { PermissionApprovalStore } from 'packages/obsidian/src/permissions/approval-store';
import { hashCode } from 'packages/obsidian/src/permissions/hash';
import type { PermissionId } from 'packages/obsidian/src/permissions/permissions';
import { assertKnownPermissions, parseLeadingPermissions } from 'packages/obsidian/src/permissions/permissions';
import type { RpcRegistry } from 'packages/obsidian/src/rpc/rpc-registry';

export interface PermissionPromptRequest {
	codeHash: string;
	permissions: PermissionId[];
	source?: SafeJsExecutionOptions['source'];
}

export interface PermissionPrompt {
	requestApproval(request: PermissionPromptRequest): Promise<boolean>;
}

export interface SafeJsExecutionServiceDependencies {
	rpcRegistry: RpcRegistry;
	approvalStore: PermissionApprovalStore;
	permissionPrompt: PermissionPrompt;
	workerFactory: WorkerFactory;
	getDefaultTimeoutMs(): number;
	hashSource?(code: string): Promise<string>;
	now?(): number;
	createExecutionId?(): string;
	setExecutionTimeout?(callback: () => void, timeoutMs: number): number;
	clearExecutionTimeout?(timeoutId: number): void;
}

export class SafeJsExecutionService {
	private readonly approvalStore: PermissionApprovalStore;
	private readonly createExecutionId: () => string;
	private readonly getDefaultTimeoutMs: () => number;
	private readonly hashSource: (code: string) => Promise<string>;
	private readonly now: () => number;
	private readonly permissionPrompt: PermissionPrompt;
	private readonly rpcRegistry: RpcRegistry;
	private readonly workerFactory: WorkerFactory;
	private readonly activeWorkers = new Set<WorkerClient>();
	private readonly clearExecutionTimeout: (timeoutId: number) => void;
	private readonly setExecutionTimeout: (callback: () => void, timeoutMs: number) => number;

	constructor(dependencies: SafeJsExecutionServiceDependencies) {
		this.approvalStore = dependencies.approvalStore;
		this.createExecutionId = (): string => dependencies.createExecutionId?.() ?? crypto.randomUUID();
		this.getDefaultTimeoutMs = (): number => dependencies.getDefaultTimeoutMs();
		this.hashSource = async (code: string): Promise<string> => dependencies.hashSource?.(code) ?? hashCode(code);
		this.now = (): number => dependencies.now?.() ?? Date.now();
		this.permissionPrompt = dependencies.permissionPrompt;
		this.rpcRegistry = dependencies.rpcRegistry;
		this.clearExecutionTimeout = (timeoutId: number): void => {
			if (dependencies.clearExecutionTimeout !== undefined) {
				dependencies.clearExecutionTimeout(timeoutId);
				return;
			}

			activeWindow.clearTimeout(timeoutId);
		};
		this.setExecutionTimeout = (callback: () => void, timeoutMs: number): number => {
			if (dependencies.setExecutionTimeout !== undefined) {
				return dependencies.setExecutionTimeout(callback, timeoutMs);
			}

			return activeWindow.setTimeout(callback, timeoutMs);
		};
		this.workerFactory = dependencies.workerFactory;
	}

	async execute(code: string, options: SafeJsExecutionOptions = {}): Promise<SafeJsExecutionResult> {
		const startedAt = this.now();
		const codeHash = await this.hashSource(code);
		let permissions: PermissionId[] = [];

		try {
			const parsedPermissions = parseLeadingPermissions(code);
			permissions = parsedPermissions.permissions;
			assertKnownPermissions(permissions, this.rpcRegistry.getKnownPermissions());
		} catch (error) {
			return {
				status: 'parse-error',
				codeHash,
				message: error instanceof Error ? error.message : 'Unable to parse permissions.',
				permissions,
				elapsedMs: this.now() - startedAt,
			};
		}

		const approval = this.approvalStore.load(codeHash);
		const approvedPermissions = new Set(approval?.permissions ?? []);
		const missingPermissions = permissions.filter(permission => !approvedPermissions.has(permission));
		if (missingPermissions.length > 0) {
			const approved = await this.permissionPrompt.requestApproval({
				codeHash,
				permissions: missingPermissions,
				source: options.source,
			});

			if (!approved) {
				return {
					status: 'permission-denied',
					codeHash,
					message: `Execution cancelled because permission approval was denied for ${missingPermissions.join(', ')}.`,
					permissions,
					elapsedMs: this.now() - startedAt,
				};
			}

			this.approvalStore.save({
				codeHash,
				permissions: [...new Set([...approvedPermissions, ...missingPermissions])],
				updatedAt: this.now(),
			});
		}

		return await this.executeInWorker(code, codeHash, new Set(permissions), startedAt, options);
	}

	cancelAll(): void {
		for (const worker of this.activeWorkers) {
			worker.terminate();
		}
		this.activeWorkers.clear();
	}

	private async executeInWorker(
		code: string,
		codeHash: string,
		grantedPermissions: ReadonlySet<PermissionId>,
		startedAt: number,
		options: SafeJsExecutionOptions,
	): Promise<SafeJsExecutionResult> {
		const executionId = this.createExecutionId();
		const worker = this.workerFactory.create();
		const timeoutMs = options.timeoutMs ?? this.getDefaultTimeoutMs();
		this.activeWorkers.add(worker);

		return await new Promise<SafeJsExecutionResult>(resolve => {
			let settled = false;
			const cleanupCallbacks: (() => void)[] = [];
			const settle = (result: SafeJsExecutionResult): void => {
				if (settled) {
					return;
				}

				settled = true;
				this.clearExecutionTimeout(timeoutHandle);
				for (const cleanup of cleanupCallbacks) {
					cleanup();
				}
				worker.terminate();
				this.activeWorkers.delete(worker);
				resolve(result);
			};

			const timeoutHandle = this.setExecutionTimeout(() => {
				settle({
					status: 'timeout',
					codeHash,
					message: `Execution timed out after ${timeoutMs}ms.`,
					permissions: [...grantedPermissions],
					elapsedMs: this.now() - startedAt,
				});
			}, timeoutMs);

			cleanupCallbacks.push(
				worker.onMessage(message => {
					const parsedMessage = workerToHostMessageSchema.safeParse(message);
					if (!parsedMessage.success) {
						settle({
							status: 'validation-error',
							codeHash,
							message: 'Worker sent an invalid message.',
							permissions: [...grantedPermissions],
							elapsedMs: this.now() - startedAt,
						});
						return;
					}

					if (parsedMessage.data.executionId !== executionId) {
						settle({
							status: 'validation-error',
							codeHash,
							message: 'Worker sent a message for an unknown execution.',
							permissions: [...grantedPermissions],
							elapsedMs: this.now() - startedAt,
						});
						return;
					}

					if (parsedMessage.data.type === 'rpc-request') {
						const rpcMessage = parsedMessage.data;
						void this.rpcRegistry
							.dispatch(rpcMessage.method, rpcMessage.params, {
								grantedPermissions,
							})
							.then(result => {
								const response: HostRpcResponseMessage = result.ok
									? {
											type: 'rpc-response',
											executionId,
											rpcRequestId: rpcMessage.rpcRequestId,
											ok: true,
											result: result.result,
										}
									: {
											type: 'rpc-response',
											executionId,
											rpcRequestId: rpcMessage.rpcRequestId,
											ok: false,
											error: result.error,
										};
								worker.postMessage(response);
							})
							.catch(error => {
								worker.postMessage({
									type: 'rpc-response',
									executionId,
									rpcRequestId: rpcMessage.rpcRequestId,
									ok: false,
									error: {
										code: 'rpc-dispatch-error',
										message: error instanceof Error ? error.message : 'RPC dispatch failed.',
									},
								});
							});
						return;
					}

					if (parsedMessage.data.ok) {
						settle({
							status: 'success',
							codeHash,
							value: parsedMessage.data.value,
							permissions: [...grantedPermissions],
							elapsedMs: this.now() - startedAt,
						});
						return;
					}

					settle({
						status: 'runtime-error',
						codeHash,
						message: parsedMessage.data.error.message,
						permissions: [...grantedPermissions],
						elapsedMs: this.now() - startedAt,
					});
				}),
				worker.onError(error => {
					settle({
						status: 'runtime-error',
						codeHash,
						message: error.message,
						permissions: [...grantedPermissions],
						elapsedMs: this.now() - startedAt,
					});
				}),
			);

			worker.postMessage({
				type: 'execute',
				executionId,
				code,
				rpcBindings: this.rpcRegistry.getWorkerBindings(),
			});
		});
	}
}
