import type { Plugin } from 'obsidian';
import type { SafeJsExecutionOptions, SafeJsExecutionResult } from 'packages/obsidian/src/execution/contracts';
import type { SafeJsExecutionService } from 'packages/obsidian/src/execution/execution-service';
import type { PermissionDefinition } from 'packages/obsidian/src/permissions/permissions';
import type {
	RpcContext,
	RpcMethodDefinition,
	RpcRegistrationOwner,
	RpcRegistry,
	SafeJsRegistration,
	SandboxGlobalRegistration,
} from 'packages/obsidian/src/rpc/rpc-registry';
import type {
	SafeJsValidationContext,
	SafeJsValidationFunction,
	SafeJsValidationResult,
	SafeJsValidator,
	SafeJsValidatorReference,
} from 'packages/obsidian/src/rpc/validators';

export interface SafeJsPublicApi {
	forPlugin(plugin: Plugin): SafeJsCallerApi;
}

export interface SafeJsCallerApi {
	execute(code: string, options?: SafeJsExecutionOptions): Promise<SafeJsExecutionResult>;
	validate<T = unknown>(validator: SafeJsValidatorReference<T>, value: unknown, context?: SafeJsValidationContext): SafeJsValidationResult<T>;
	getValidatorIds(): string[];
	registerPermission(definition: PermissionDefinition): SafeJsRegistration;
	registerSandboxFunction<TParams = unknown, TResult = unknown>(definition: SandboxFunctionDefinition<TParams, TResult>): SafeJsRegistration;
	registerSandboxGlobal(definition: SandboxGlobalDefinition): SafeJsRegistration;
}

export type SandboxValidatorReference<T = unknown> = string | SafeJsValidator<T> | SafeJsValidationFunction<T>;

export interface SandboxCallContext extends RpcContext {
	callerPluginId: string;
	callerPluginName: string;
}

export interface SandboxFunctionDefinition<TParams = unknown, TResult = unknown> {
	method: string;
	permission: PermissionDefinition['id'];
	namespace: string;
	functionName: string;
	description: string;
	usage: string;
	paramStyle: 'object' | 'path' | 'optionalPath' | 'args';
	argNames?: string[];
	requestValidator: SandboxValidatorReference<TParams>;
	responseValidator: SandboxValidatorReference<TResult>;
	handler(params: TParams, context: SandboxCallContext): Promise<TResult> | TResult;
}

export type SandboxGlobalDefinition = SandboxGlobalRegistration;

export interface SafeJsPublicApiDependencies {
	executionService: SafeJsExecutionService;
	rpcRegistry: RpcRegistry;
}

export class DefaultSafeJsPublicApi implements SafeJsPublicApi {
	private readonly executionService: SafeJsExecutionService;
	private readonly rpcRegistry: RpcRegistry;

	constructor(dependencies: SafeJsPublicApiDependencies) {
		this.executionService = dependencies.executionService;
		this.rpcRegistry = dependencies.rpcRegistry;
	}

	forPlugin(plugin: Plugin): SafeJsCallerApi {
		const owner = createOwner(plugin);
		plugin.register(() => {
			this.rpcRegistry.unregisterOwner(owner.pluginId);
		});

		return new DefaultSafeJsCallerApi({
			executionService: this.executionService,
			owner,
			rpcRegistry: this.rpcRegistry,
		});
	}
}

interface SafeJsCallerApiDependencies {
	executionService: SafeJsExecutionService;
	owner: Required<RpcRegistrationOwner>;
	rpcRegistry: RpcRegistry;
}

class DefaultSafeJsCallerApi implements SafeJsCallerApi {
	private readonly executionService: SafeJsExecutionService;
	private readonly owner: Required<RpcRegistrationOwner>;
	private readonly rpcRegistry: RpcRegistry;

	constructor(dependencies: SafeJsCallerApiDependencies) {
		this.executionService = dependencies.executionService;
		this.owner = dependencies.owner;
		this.rpcRegistry = dependencies.rpcRegistry;
	}

	async execute(code: string, options: SafeJsExecutionOptions = {}): Promise<SafeJsExecutionResult> {
		return await this.executionService.execute(code, {
			...options,
			source: {
				...options.source,
				callerPluginId: this.owner.pluginId,
				callerPluginName: this.owner.pluginName,
			},
		});
	}

	validate<T = unknown>(validator: SafeJsValidatorReference<T>, value: unknown, context: SafeJsValidationContext = {}): SafeJsValidationResult<T> {
		return this.rpcRegistry.validate(validator, value, {
			...context,
			direction: context.direction ?? 'manual',
		});
	}

	getValidatorIds(): string[] {
		return this.rpcRegistry.getValidatorIds();
	}

	registerPermission(definition: PermissionDefinition): SafeJsRegistration {
		return this.rpcRegistry.registerPermission(definition, this.owner);
	}

	registerSandboxFunction<TParams = unknown, TResult = unknown>(definition: SandboxFunctionDefinition<TParams, TResult>): SafeJsRegistration {
		if (this.rpcRegistry.getPermissionDefinition(definition.permission) === undefined) {
			throw new Error(`Unknown permission '${definition.permission}' for sandbox function '${definition.method}'.`);
		}

		const method: RpcMethodDefinition<TParams, TResult> = {
			method: definition.method,
			permission: definition.permission,
			description: definition.description,
			usage: definition.usage,
			requestValidator: definition.requestValidator,
			responseValidator: definition.responseValidator,
			binding: {
				namespace: definition.namespace,
				functionName: definition.functionName,
				paramStyle: definition.paramStyle,
				argNames: definition.argNames,
			},
			handler: (params, context) =>
				definition.handler(params, {
					...context,
					callerPluginId: this.owner.pluginId,
					callerPluginName: this.owner.pluginName,
				}),
		};

		return this.rpcRegistry.registerMethod(method, this.owner);
	}

	registerSandboxGlobal(definition: SandboxGlobalDefinition): SafeJsRegistration {
		return this.rpcRegistry.registerSandboxGlobal(definition, this.owner);
	}
}

function createOwner(plugin: Plugin): Required<RpcRegistrationOwner> {
	return {
		pluginId: plugin.manifest.id,
		pluginName: plugin.manifest.name,
	};
}
