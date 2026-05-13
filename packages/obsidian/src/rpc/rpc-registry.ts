import type { JsonValue, WorkerRpcBinding } from 'packages/obsidian/src/execution/contracts';
import type { PermissionDefinition, PermissionId } from 'packages/obsidian/src/permissions/permissions';
import { PERMISSION_DEFINITIONS, getPermissionDefinition } from 'packages/obsidian/src/permissions/permissions';
import { z } from 'zod';

export interface RpcContext {
	grantedPermissions: ReadonlySet<PermissionId>;
	codeHash?: string;
	signal?: AbortSignal;
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
	usage: string;
	requestSchema: z.ZodType<TParams>;
	responseSchema: z.ZodType<TResult>;
	binding: Omit<WorkerRpcBinding, 'method' | 'permission'>;
	handler(params: TParams, context: RpcContext): Promise<TResult> | TResult;
}

export interface RpcDocsMethod {
	method: string;
	apiPath: string;
	description: string;
	usage: string;
	permission: PermissionId;
}

export interface RpcDocsPermission {
	permission: PermissionDefinition;
	methods: RpcDocsMethod[];
}

export class RpcRegistry {
	private readonly methods = new Map<string, RpcMethodDefinition<unknown, unknown>>();
	private readonly permissionDefinitions = new Map<PermissionId, PermissionDefinition>();

	constructor(methods: readonly RpcMethodDefinition[] = [], permissionDefinitions: readonly PermissionDefinition[] = PERMISSION_DEFINITIONS) {
		for (const permission of permissionDefinitions) {
			this.permissionDefinitions.set(permission.id, permission);
		}

		for (const method of methods) {
			this.register(method);
		}
	}

	register(method: RpcMethodDefinition<unknown, unknown>): void {
		if (this.methods.has(method.method)) {
			throw new Error(`Duplicate RPC method '${method.method}'.`);
		}

		if (!this.permissionDefinitions.has(method.permission)) {
			const definition = getPermissionDefinition(method.permission);
			if (definition !== undefined) {
				this.permissionDefinitions.set(definition.id, definition);
			}
		}

		this.methods.set(method.method, method);
	}

	getKnownPermissions(): ReadonlySet<PermissionId> {
		return new Set([
			...[...this.permissionDefinitions.keys()].filter(permission => this.hasMethodsForPermission(permission)),
			...[...this.methods.values()].map(method => method.permission),
		]);
	}

	getWorkerBindings(): WorkerRpcBinding[] {
		return [...this.methods.values()].map(method => ({
			method: method.method,
			permission: method.permission,
			namespace: method.binding.namespace,
			functionName: method.binding.functionName,
			paramStyle: method.binding.paramStyle,
			argNames: method.binding.argNames,
		}));
	}

	getDocs(): RpcDocsPermission[] {
		const docs = [...this.permissionDefinitions.values()]
			.map(permission => ({
				permission,
				methods: [...this.methods.values()]
					.filter(method => method.permission === permission.id)
					.map(method => ({
						method: method.method,
						apiPath: `api.${method.binding.namespace}.${method.binding.functionName}`,
						description: method.description,
						usage: method.usage,
						permission: method.permission,
					}))
					.sort((left, right) => left.apiPath.localeCompare(right.apiPath)),
			}))
			.filter(group => group.methods.length > 0);

		return docs.sort((left, right) => left.permission.id.localeCompare(right.permission.id));
	}

	getPermissionDefinition(permission: PermissionId): PermissionDefinition | undefined {
		return this.permissionDefinitions.get(permission);
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

		if (context.signal?.aborted === true) {
			return {
				ok: false,
				error: {
					code: 'execution-cancelled',
					message: 'Execution was cancelled before the RPC method ran.',
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

	private hasMethodsForPermission(permission: PermissionId): boolean {
		return [...this.methods.values()].some(method => method.permission === permission);
	}
}
