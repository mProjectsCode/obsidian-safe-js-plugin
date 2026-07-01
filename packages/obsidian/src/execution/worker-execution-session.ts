import type { JsonValue, PermissionId, SafeJsExecutionOptions, SafeJsExecutionResult } from '@lemons_dev/obsidian-safe-js-api';
import type { HostRpcRequestMessage, HostRpcResponseMessage } from '@lemons_dev/obsidian-safe-js-api/internal';
import { workerToHostMessageSchema } from 'packages/obsidian/src/execution/contracts';
import type { WorkerFactory } from 'packages/obsidian/src/execution/worker-client';
import type { RpcRegistry } from 'packages/obsidian/src/rpc/rpc-registry';

export interface ActiveExecution {
	cancel(): void;
}

export interface WorkerExecutionSessionDependencies {
	rpcRegistry: RpcRegistry;
	workerFactory: WorkerFactory;
	activeExecutions: Set<ActiveExecution>;
	createExecutionId(): string;
	now(): number;
	clearExecutionTimeout(timeoutId: number): void;
	setExecutionTimeout(callback: () => void, timeoutMs: number): number;
}

export interface WorkerExecutionSessionOptions {
	code: string;
	codeHash: string;
	mode?: 'script' | 'expression';
	inputs?: Record<string, JsonValue>;
	grantedPermissions: ReadonlySet<PermissionId>;
	startedAt: number;
	executionOptions: SafeJsExecutionOptions;
	timeoutMs: number | null;
}

export class WorkerExecutionSession {
	private readonly activeExecutions: Set<ActiveExecution>;
	private readonly clearExecutionTimeout: (timeoutId: number) => void;
	private readonly createExecutionId: () => string;
	private readonly now: () => number;
	private readonly rpcRegistry: RpcRegistry;
	private readonly setExecutionTimeout: (callback: () => void, timeoutMs: number) => number;
	private readonly workerFactory: WorkerFactory;

	constructor(dependencies: WorkerExecutionSessionDependencies) {
		this.activeExecutions = dependencies.activeExecutions;
		this.clearExecutionTimeout = (timeoutId: number): void => {
			dependencies.clearExecutionTimeout(timeoutId);
		};
		this.createExecutionId = (): string => dependencies.createExecutionId();
		this.now = (): number => dependencies.now();
		this.rpcRegistry = dependencies.rpcRegistry;
		this.setExecutionTimeout = (callback: () => void, timeoutMs: number): number => dependencies.setExecutionTimeout(callback, timeoutMs);
		this.workerFactory = dependencies.workerFactory;
	}

	async execute(options: WorkerExecutionSessionOptions): Promise<SafeJsExecutionResult> {
		const executionId = this.createExecutionId();
		const worker = this.workerFactory.create();

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
				settle(this.createCancelledResult(options.codeHash, [...options.grantedPermissions], options.startedAt));
			};
			const activeExecution = { cancel };
			this.activeExecutions.add(activeExecution);

			if (options.timeoutMs !== null) {
				timeoutHandle = this.setExecutionTimeout(() => {
					abortController.abort();
					settle({
						status: 'timeout',
						codeHash: options.codeHash,
						message: `Execution timed out after ${options.timeoutMs}ms.`,
						permissions: [...options.grantedPermissions],
						elapsedMs: this.now() - options.startedAt,
					});
				}, options.timeoutMs);
			}

			if (options.executionOptions.signal !== undefined) {
				const abortListener = (): void => {
					cancel();
				};
				options.executionOptions.signal.addEventListener('abort', abortListener, { once: true });
				cleanupCallbacks.push(() => {
					options.executionOptions.signal?.removeEventListener('abort', abortListener);
				});
			}

			if (options.executionOptions.signal?.aborted === true) {
				cancel();
				return;
			}

			cleanupCallbacks.push(
				worker.onMessage(message => {
					this.handleWorkerMessage(message, executionId, options, abortController, () => settled, worker.postMessage.bind(worker), settle);
				}),
				worker.onError(error => {
					settle({
						status: 'runtime-error',
						codeHash: options.codeHash,
						message: error.message,
						permissions: [...options.grantedPermissions],
						elapsedMs: this.now() - options.startedAt,
					});
				}),
			);

			worker.postMessage({
				type: 'execute',
				executionId,
				code: options.code,
				mode: options.mode ?? 'script',
				inputs: options.inputs ?? {},
				rpcBindings: this.rpcRegistry.getWorkerBindings(),
				sandboxGlobals: this.rpcRegistry.getSandboxGlobals(options.grantedPermissions),
			});
		});
	}

	private handleWorkerMessage(
		message: unknown,
		executionId: string,
		options: WorkerExecutionSessionOptions,
		abortController: AbortController,
		isSettled: () => boolean,
		postMessage: (message: HostRpcResponseMessage) => void,
		settle: (result: SafeJsExecutionResult) => void,
	): void {
		const parsedMessage = workerToHostMessageSchema.safeParse(message);
		if (!parsedMessage.success) {
			settle(this.createValidationErrorResult(options, 'Worker sent an invalid message.'));
			return;
		}

		if (parsedMessage.data.executionId !== executionId) {
			settle(this.createValidationErrorResult(options, 'Worker sent a message for an unknown execution.'));
			return;
		}

		if (parsedMessage.data.type === 'rpc-request') {
			this.handleRpcRequest(parsedMessage.data, executionId, options, abortController, isSettled, postMessage);
			return;
		}

		if (parsedMessage.data.ok) {
			settle({
				status: 'success',
				codeHash: options.codeHash,
				value: parsedMessage.data.value,
				permissions: [...options.grantedPermissions],
				elapsedMs: this.now() - options.startedAt,
			});
			return;
		}

		settle({
			status: 'runtime-error',
			codeHash: options.codeHash,
			message: parsedMessage.data.error.message,
			permissions: [...options.grantedPermissions],
			elapsedMs: this.now() - options.startedAt,
		});
	}

	private handleRpcRequest(
		rpcMessage: HostRpcRequestMessage,
		executionId: string,
		options: WorkerExecutionSessionOptions,
		abortController: AbortController,
		isSettled: () => boolean,
		postMessage: (message: HostRpcResponseMessage) => void,
	): void {
		if (abortController.signal.aborted) {
			return;
		}

		void this.rpcRegistry
			.dispatch(rpcMessage.method, rpcMessage.params, {
				grantedPermissions: options.grantedPermissions,
				codeHash: options.codeHash,
				signal: abortController.signal,
			})
			.then(result => {
				if (isSettled() || abortController.signal.aborted) {
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
				postMessage(response);
			})
			.catch(error => {
				if (isSettled() || abortController.signal.aborted) {
					return;
				}

				postMessage({
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

	private createValidationErrorResult(options: WorkerExecutionSessionOptions, message: string): SafeJsExecutionResult {
		return {
			status: 'validation-error',
			codeHash: options.codeHash,
			message,
			permissions: [...options.grantedPermissions],
			elapsedMs: this.now() - options.startedAt,
		};
	}
}
