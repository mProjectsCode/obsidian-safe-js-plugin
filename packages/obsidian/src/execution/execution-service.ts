import type { HostRpcResponseMessage, SafeJsExecutionOptions, SafeJsExecutionResult } from 'packages/obsidian/src/execution/contracts';
import { workerToHostMessageSchema } from 'packages/obsidian/src/execution/contracts';
import type { WorkerFactory } from 'packages/obsidian/src/execution/worker-client';
import type { PermissionApprovalStore } from 'packages/obsidian/src/permissions/approval-store';
import { hashCode } from 'packages/obsidian/src/permissions/hash';
import type { PermissionId } from 'packages/obsidian/src/permissions/permissions';
import { assertKnownPermissions, expandPermissionGroups, parseLeadingPermissions } from 'packages/obsidian/src/permissions/permissions';
import type { RpcRegistry } from 'packages/obsidian/src/rpc/rpc-registry';

export interface PermissionPromptRequest {
	codeHash: string;
	permissions: PermissionId[];
	source?: SafeJsExecutionOptions['source'];
	signal?: AbortSignal;
}

export interface PermissionPrompt {
	requestApproval(request: PermissionPromptRequest): Promise<boolean>;
}

export interface SafeJsExecutionServiceDependencies {
	rpcRegistry: RpcRegistry;
	approvalStore: PermissionApprovalStore;
	permissionPrompt: PermissionPrompt;
	workerFactory: WorkerFactory;
	getDefaultTimeoutMs(): number | null;
	getAutoAllowLowRiskPermissions?(): boolean;
	hashSource?(code: string): Promise<string>;
	now?(): number;
	createExecutionId?(): string;
	setExecutionTimeout?(callback: () => void, timeoutMs: number): number;
	clearExecutionTimeout?(timeoutId: number): void;
}

export class SafeJsExecutionService {
	private readonly approvalStore: PermissionApprovalStore;
	private readonly createExecutionId: () => string;
	private readonly getAutoAllowLowRiskPermissions: () => boolean;
	private readonly getDefaultTimeoutMs: () => number | null;
	private readonly hashSource: (code: string) => Promise<string>;
	private readonly now: () => number;
	private readonly permissionPrompt: PermissionPrompt;
	private readonly rpcRegistry: RpcRegistry;
	private readonly workerFactory: WorkerFactory;
	private readonly activeExecutions = new Set<{ cancel(): void }>();
	private readonly clearExecutionTimeout: (timeoutId: number) => void;
	private readonly setExecutionTimeout: (callback: () => void, timeoutMs: number) => number;

	constructor(dependencies: SafeJsExecutionServiceDependencies) {
		this.approvalStore = dependencies.approvalStore;
		this.createExecutionId = (): string => dependencies.createExecutionId?.() ?? crypto.randomUUID();
		this.getAutoAllowLowRiskPermissions = (): boolean => dependencies.getAutoAllowLowRiskPermissions?.() ?? false;
		this.getDefaultTimeoutMs = (): number | null => dependencies.getDefaultTimeoutMs();
		this.hashSource = async (code: string): Promise<string> => dependencies.hashSource?.(code) ?? hashCode(code);
		this.now = (): number => dependencies.now?.() ?? Date.now();
		this.permissionPrompt = dependencies.permissionPrompt;
		this.rpcRegistry = dependencies.rpcRegistry;
		this.clearExecutionTimeout = (timeoutId: number): void => {
			if (dependencies.clearExecutionTimeout !== undefined) {
				dependencies.clearExecutionTimeout(timeoutId);
				return;
			}

			window.clearTimeout(timeoutId);
		};
		this.setExecutionTimeout = (callback: () => void, timeoutMs: number): number => {
			if (dependencies.setExecutionTimeout !== undefined) {
				return dependencies.setExecutionTimeout(callback, timeoutMs);
			}

			return window.setTimeout(callback, timeoutMs);
		};
		this.workerFactory = dependencies.workerFactory;
	}

	async execute(code: string, options: SafeJsExecutionOptions = {}): Promise<SafeJsExecutionResult> {
		const startedAt = this.now();
		const codeHash = await this.hashSource(code);
		let permissions: PermissionId[] = [];

		try {
			const parsedPermissions = parseLeadingPermissions(code);
			const knownPermissions = this.rpcRegistry.getKnownPermissions();
			assertKnownPermissions(parsedPermissions.permissions, knownPermissions);
			permissions = expandPermissionGroups(parsedPermissions.permissions, knownPermissions);
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
		const autoApprovedPermissions = this.getAutoAllowLowRiskPermissions()
			? missingPermissions.filter(permission => this.isLowRiskPermission(permission))
			: [];
		const promptedPermissions = missingPermissions.filter(permission => !autoApprovedPermissions.includes(permission));

		if (promptedPermissions.length > 0) {
			const approved = await this.permissionPrompt.requestApproval({
				codeHash,
				permissions: promptedPermissions,
				source: options.source,
				signal: options.signal,
			});

			if (!approved) {
				if (options.signal?.aborted === true) {
					return this.createCancelledResult(codeHash, permissions, startedAt);
				}

				return {
					status: 'permission-denied',
					codeHash,
					message: `Execution cancelled because permission approval was denied for ${promptedPermissions.join(', ')}.`,
					permissions,
					elapsedMs: this.now() - startedAt,
				};
			}
		}

		if (options.signal?.aborted === true) {
			return this.createCancelledResult(codeHash, permissions, this.now());
		}

		const newlyApprovedPermissions = [...autoApprovedPermissions, ...promptedPermissions];
		if (newlyApprovedPermissions.length > 0) {
			this.approvalStore.save({
				codeHash,
				permissions: [...new Set([...approvedPermissions, ...newlyApprovedPermissions])],
				updatedAt: this.now(),
			});
		}

		return await this.executeInWorker(code, codeHash, new Set(permissions), this.now(), options);
	}

	cancelAll(): void {
		for (const execution of this.activeExecutions) {
			execution.cancel();
		}
		this.activeExecutions.clear();
	}

	private isLowRiskPermission(permission: PermissionId): boolean {
		return this.rpcRegistry.getPermissionDefinition(permission)?.severity === 'low';
	}

	private createCancelledResult(codeHash: string, permissions: PermissionId[], startedAt: number): SafeJsExecutionResult {
		return {
			status: 'cancelled',
			codeHash,
			message: 'Execution was cancelled.',
			permissions,
			elapsedMs: this.now() - startedAt,
		};
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
		const timeoutMs = options.timeoutMs === undefined ? this.getDefaultTimeoutMs() : options.timeoutMs;

		return await new Promise<SafeJsExecutionResult>(resolve => {
			let settled = false;
			let timeoutHandle: number | null = null;
			const cleanupCallbacks: (() => void)[] = [];
			const abortController = new AbortController();
			const settle = (result: SafeJsExecutionResult): void => {
				if (settled) {
					return;
				}

				settled = true;
				if (timeoutHandle !== null) {
					this.clearExecutionTimeout(timeoutHandle);
				}
				for (const cleanup of cleanupCallbacks) {
					cleanup();
				}
				worker.terminate();
				this.activeExecutions.delete(activeExecution);
				resolve(result);
			};
			const cancel = (): void => {
				abortController.abort();
				settle(this.createCancelledResult(codeHash, [...grantedPermissions], startedAt));
			};
			const activeExecution = { cancel };
			this.activeExecutions.add(activeExecution);

			if (timeoutMs !== null) {
				timeoutHandle = this.setExecutionTimeout(() => {
					abortController.abort();
					settle({
						status: 'timeout',
						codeHash,
						message: `Execution timed out after ${timeoutMs}ms.`,
						permissions: [...grantedPermissions],
						elapsedMs: this.now() - startedAt,
					});
				}, timeoutMs);
			}

			if (options.signal !== undefined) {
				const abortListener = (): void => {
					cancel();
				};
				options.signal.addEventListener('abort', abortListener, { once: true });
				cleanupCallbacks.push(() => {
					options.signal?.removeEventListener('abort', abortListener);
				});
			}

			if (options.signal?.aborted === true) {
				cancel();
				return;
			}

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
						if (abortController.signal.aborted) {
							return;
						}

						void this.rpcRegistry
							.dispatch(rpcMessage.method, rpcMessage.params, {
								grantedPermissions,
								codeHash,
								signal: abortController.signal,
							})
							.then(result => {
								if (settled || abortController.signal.aborted) {
									return;
								}

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
								if (settled || abortController.signal.aborted) {
									return;
								}

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
