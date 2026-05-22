import type { Plugin } from 'obsidian';
import type { SafeJsExecutionService } from 'packages/obsidian/src/execution/execution-service';
import type { RpcMethodDefinition, RpcRegistrationOwner, RpcRegistry } from 'packages/obsidian/src/rpc/rpc-registry';
import type {
	PermissionDefinition,
	SafeJsValidationContext,
	SafeJsValidationFunction,
	SafeJsValidationResult,
	SafeJsValidator,
	SafeJsValidatorReference,
	SafeJsCallerApi,
	SafeJsExecutionOptions,
	SafeJsExecutionResult,
	SafeJsPublicApi,
	SafeJsRegistration,
	SandboxFunctionDefinition,
	SandboxGlobalDefinition,
	SandboxValidatorReference,
} from 'packages/safe-js-api/src';

export type {
	PermissionDefinition,
	SafeJsCallerApi,
	SafeJsExecutionOptions,
	SafeJsExecutionResult,
	SafeJsPublicApi,
	SafeJsRegistration,
	SafeJsValidationContext,
	SafeJsValidationFunction,
	SafeJsValidationResult,
	SafeJsValidator,
	SafeJsValidatorReference,
	SandboxFunctionDefinition,
	SandboxGlobalDefinition,
	SandboxValidatorReference,
};

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
