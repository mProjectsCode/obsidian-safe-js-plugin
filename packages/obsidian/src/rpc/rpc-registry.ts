import type { JsonValue, WorkerRpcBinding } from 'packages/obsidian/src/execution/contracts';
import type { PermissionId } from 'packages/obsidian/src/permissions/permissions';
import { z } from 'zod';

export interface RpcContext {
	grantedPermissions: ReadonlySet<PermissionId>;
}

export interface RpcDispatchSuccess {
	ok: true;
	result: JsonValue;
}

export interface RpcDispatchFailure {
	ok: false;
	error: {
		code: string;
		message: string;
	};
}

export type RpcDispatchResult = RpcDispatchSuccess | RpcDispatchFailure;

export interface RpcMethodDefinition<TParams = unknown, TResult = unknown> {
	method: string;
	permission: PermissionId;
	description: string;
	requestSchema: z.ZodType<TParams>;
	responseSchema: z.ZodType<TResult>;
	binding: Omit<WorkerRpcBinding, 'method' | 'permission'>;
	handler(params: TParams, context: RpcContext): Promise<TResult> | TResult;
}

export class RpcRegistry {
	private readonly methods = new Map<string, RpcMethodDefinition<unknown, unknown>>();

	constructor(methods: readonly RpcMethodDefinition[] = []) {
		for (const method of methods) {
			this.register(method);
		}
	}

	register(method: RpcMethodDefinition<unknown, unknown>): void {
		if (this.methods.has(method.method)) {
			throw new Error(`Duplicate RPC method '${method.method}'.`);
		}

		this.methods.set(method.method, method);
	}

	getKnownPermissions(): ReadonlySet<PermissionId> {
		return new Set([...this.methods.values()].map(method => method.permission));
	}

	getWorkerBindings(): WorkerRpcBinding[] {
		return [...this.methods.values()].map(method => ({
			method: method.method,
			permission: method.permission,
			namespace: method.binding.namespace,
			functionName: method.binding.functionName,
			paramStyle: method.binding.paramStyle,
		}));
	}

	async dispatch(methodName: string, params: JsonValue, context: RpcContext): Promise<RpcDispatchResult> {
		const method = this.methods.get(methodName);
		if (method === undefined) {
			return {
				ok: false,
				error: {
					code: 'unknown-rpc-method',
					message: `Unknown RPC method '${methodName}'.`,
				},
			};
		}

		if (!context.grantedPermissions.has(method.permission)) {
			return {
				ok: false,
				error: {
					code: 'missing-permission',
					message: `RPC method '${methodName}' requires permission '${method.permission}'. Add '// @permission ${method.permission}' and approve it before calling this method.`,
				},
			};
		}

		const requestResult = method.requestSchema.safeParse(params);
		if (!requestResult.success) {
			return {
				ok: false,
				error: {
					code: 'invalid-rpc-request',
					message: `Invalid request for RPC method '${methodName}': ${z.prettifyError(requestResult.error)}`,
				},
			};
		}

		try {
			const rawResult = await method.handler(requestResult.data, context);
			const responseResult = method.responseSchema.safeParse(rawResult);
			if (!responseResult.success) {
				return {
					ok: false,
					error: {
						code: 'invalid-rpc-response',
						message: `RPC method '${methodName}' returned an invalid response: ${z.prettifyError(responseResult.error)}`,
					},
				};
			}

			return {
				ok: true,
				result: responseResult.data as JsonValue,
			};
		} catch (error) {
			return {
				ok: false,
				error: {
					code: 'rpc-handler-error',
					message: error instanceof Error ? error.message : `RPC method '${methodName}' failed.`,
				},
			};
		}
	}
}
