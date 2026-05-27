import type {
	JsonValue,
	PermissionDefinition,
	PermissionId,
	SafeJsValidationContext,
	SafeJsValidationResult,
	SafeJsValidator,
	SafeJsValidatorReference,
} from '@lemons_dev/obsidian-safe-js-api';
import type { WorkerRpcBinding } from '@lemons_dev/obsidian-safe-js-api/internal';
import type { BuiltInValidatorOptions } from 'packages/obsidian/src/rpc/validators';

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
	requestValidator: SafeJsValidatorReference<TParams>;
	responseValidator: SafeJsValidatorReference<TResult>;
	binding: Omit<WorkerRpcBinding, 'method' | 'permission'>;
	handler(params: TParams, context: RpcContext): Promise<TResult> | TResult;
}

export interface RpcRegistrationOwner {
	pluginId?: string;
	pluginName?: string;
}

export interface SandboxGlobalRegistration {
	name: string;
	description: string;
	value: JsonValue;
	permission?: PermissionId;
}

export interface RpcDocsMethod {
	method: string;
	apiPath: string;
	description: string;
	usage: string;
	permission: PermissionId;
	ownerPluginId?: string;
	ownerPluginName?: string;
}

export interface RpcDocsPermission {
	permission: PermissionDefinition;
	methods: RpcDocsMethod[];
	globals: RpcDocsGlobal[];
	ownerPluginId?: string;
	ownerPluginName?: string;
}

export interface RpcDocsGlobal {
	name: string;
	description: string;
	permission?: PermissionId;
	ownerPluginId?: string;
	ownerPluginName?: string;
}

export interface RpcRegistryOptions {
	methods?: readonly RpcMethodDefinition[];
	permissionDefinitions?: readonly PermissionDefinition[];
	validators: BuiltInValidatorOptions | readonly SafeJsValidator[];
}

export type { JsonValue, PermissionDefinition, PermissionId, SafeJsValidationContext, SafeJsValidationResult, SafeJsValidator, SafeJsValidatorReference };
