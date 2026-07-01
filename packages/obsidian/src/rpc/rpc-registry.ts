import type {
	CompoundPermissionRuleDefinition,
	PermissionDefinition,
	PermissionId,
	SafeJsRegistration,
	SafeJsValidationContext,
	SafeJsValidationResult,
	SafeJsValidator,
	SafeJsValidatorReference,
} from '@lemons_dev/obsidian-safe-js-api';
import type { WorkerRpcBinding, WorkerSandboxGlobal } from '@lemons_dev/obsidian-safe-js-api/internal';
import { jsonValueSchema } from 'packages/obsidian/src/execution/contracts';
import { isReservedSandboxGlobalName, isUsableSandboxGlobalName } from 'packages/obsidian/src/execution/utility-names';
import {
	COMPOUND_PERMISSION_RULES,
	PERMISSION_DEFINITIONS,
	getPermissionDefinition,
	matchesPermissionPattern,
} from 'packages/obsidian/src/permissions/permissions';
import type {
	JsonValue,
	RpcContext,
	RpcDispatchResult,
	RpcDocsPermission,
	RpcMethodDefinition,
	RpcRegistrationOwner,
	RpcRegistryOptions,
	SandboxGlobalRegistration,
} from 'packages/obsidian/src/rpc/rpc-registry-types';
import type { BuiltInValidatorOptions } from 'packages/obsidian/src/rpc/validators';
import { ValidatorRegistry, createBuiltInValidators } from 'packages/obsidian/src/rpc/validators';

const COMPOUND_RULE_ID_PATTERN = /^[a-z][a-z0-9-]*$/u;
const MINIMUM_COMPOUND_RULE_PERMISSIONS = 2;
const PERMISSION_SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);

export type { SafeJsRegistration } from '@lemons_dev/obsidian-safe-js-api';
export type {
	RpcContext,
	RpcDispatchFailure,
	RpcDispatchResult,
	RpcDispatchSuccess,
	RpcDocsGlobal,
	RpcDocsMethod,
	RpcDocsPermission,
	RpcMethodDefinition,
	RpcRegistrationOwner,
	RpcRegistryOptions,
	SandboxGlobalRegistration,
} from 'packages/obsidian/src/rpc/rpc-registry-types';

export class RpcRegistry {
	private readonly methods = new Map<string, RpcMethodDefinition<unknown, unknown>>();
	private readonly permissionDefinitions = new Map<PermissionId, PermissionDefinition>();
	// Snapshot the initial registry so expression blocks cannot silently gain capabilities from later plugin registrations.
	private readonly builtInPermissionIds = new Set<PermissionId>();
	private readonly compoundPermissionRules = new Map<string, CompoundPermissionRuleDefinition>();
	private readonly compoundPermissionRuleOwners = new Map<string, RpcRegistrationOwner>();
	private readonly validators: ValidatorRegistry;
	private readonly methodOwners = new Map<string, RpcRegistrationOwner>();
	private readonly permissionOwners = new Map<PermissionId, RpcRegistrationOwner>();
	private readonly sandboxGlobals = new Map<string, SandboxGlobalRegistration>();
	private readonly sandboxGlobalOwners = new Map<string, RpcRegistrationOwner>();

	constructor(options: RpcRegistryOptions) {
		this.validators = new ValidatorRegistry(isValidatorList(options.validators) ? options.validators : createBuiltInValidators(options.validators));

		const initialPermissions = options.permissionDefinitions ?? PERMISSION_DEFINITIONS;
		for (const permission of initialPermissions) {
			this.permissionDefinitions.set(permission.id, permission);
			this.builtInPermissionIds.add(permission.id);
		}

		for (const method of options.methods ?? []) {
			this.addMethod(method);
		}

		for (const rule of options.compoundPermissionRules ?? (options.permissionDefinitions === undefined ? COMPOUND_PERMISSION_RULES : [])) {
			this.addCompoundPermissionRule(rule);
		}
	}

	private addMethod(method: RpcMethodDefinition<unknown, unknown>, owner: RpcRegistrationOwner = {}): void {
		if (this.methods.has(method.method)) {
			throw new Error(`Duplicate RPC method '${method.method}'.`);
		}

		const existingBinding = [...this.methods.values()].find(
			registeredMethod =>
				registeredMethod.binding.namespace === method.binding.namespace && registeredMethod.binding.functionName === method.binding.functionName,
		);
		if (existingBinding !== undefined) {
			throw new Error(`Duplicate sandbox API path 'api.${method.binding.namespace}.${method.binding.functionName}'.`);
		}

		if (!this.permissionDefinitions.has(method.permission)) {
			const definition = getPermissionDefinition(method.permission);
			if (definition !== undefined) {
				this.permissionDefinitions.set(definition.id, definition);
			}
		}

		this.assertKnownValidator(method.requestValidator, method.method, 'request');
		this.assertKnownValidator(method.responseValidator, method.method, 'response');

		this.methods.set(method.method, method);
		this.methodOwners.set(method.method, owner);
	}

	registerPermission(permission: PermissionDefinition, owner: RpcRegistrationOwner = {}): SafeJsRegistration {
		if (this.permissionDefinitions.has(permission.id)) {
			throw new Error(`Duplicate permission '${permission.id}'.`);
		}

		this.permissionDefinitions.set(permission.id, permission);
		this.permissionOwners.set(permission.id, owner);

		return {
			unregister: createUnregisterCallback(() => {
				this.assertPermissionCanBeUnregistered(permission.id);
				this.permissionDefinitions.delete(permission.id);
				this.permissionOwners.delete(permission.id);
			}),
		};
	}

	registerCompoundPermissionRule(rule: CompoundPermissionRuleDefinition, owner: RpcRegistrationOwner = {}): SafeJsRegistration {
		this.addCompoundPermissionRule(rule, owner);
		return {
			unregister: createUnregisterCallback(() => {
				this.compoundPermissionRules.delete(rule.id);
				this.compoundPermissionRuleOwners.delete(rule.id);
			}),
		};
	}

	registerMethod(method: RpcMethodDefinition<unknown, unknown>, owner: RpcRegistrationOwner = {}): SafeJsRegistration {
		this.addMethod(method, owner);

		return {
			unregister: createUnregisterCallback(() => {
				this.methods.delete(method.method);
				this.methodOwners.delete(method.method);
			}),
		};
	}

	validate<T = unknown>(validator: SafeJsValidatorReference<T>, value: unknown, context: SafeJsValidationContext = {}): SafeJsValidationResult<T> {
		return this.validators.validate(validator, value, context);
	}

	getValidatorIds(): string[] {
		return this.validators.getIds();
	}

	registerSandboxGlobal(global: SandboxGlobalRegistration, owner: RpcRegistrationOwner = {}): SafeJsRegistration {
		if (this.sandboxGlobals.has(global.name)) {
			throw new Error(`Duplicate sandbox global '${global.name}'.`);
		}

		if (isReservedSandboxGlobalName(global.name)) {
			throw new Error(`Sandbox global '${global.name}' is reserved.`);
		}

		if (!isUsableSandboxGlobalName(global.name)) {
			throw new Error(`Invalid sandbox global name '${global.name}'.`);
		}

		if (global.permission !== undefined && !this.permissionDefinitions.has(global.permission)) {
			throw new Error(`Unknown permission '${global.permission}' for sandbox global '${global.name}'.`);
		}

		const valueResult = jsonValueSchema.safeParse(global.value);
		if (!valueResult.success) {
			throw new Error(`Sandbox global '${global.name}' must be JSON-safe.`);
		}

		this.sandboxGlobals.set(global.name, global);
		this.sandboxGlobalOwners.set(global.name, owner);

		return {
			unregister: createUnregisterCallback(() => {
				this.sandboxGlobals.delete(global.name);
				this.sandboxGlobalOwners.delete(global.name);
			}),
		};
	}

	unregisterOwner(pluginId: string): void {
		for (const [ruleId, owner] of this.compoundPermissionRuleOwners) {
			if (owner.pluginId === pluginId) {
				this.compoundPermissionRules.delete(ruleId);
				this.compoundPermissionRuleOwners.delete(ruleId);
			}
		}
		for (const [methodName, owner] of this.methodOwners) {
			if (owner.pluginId === pluginId) {
				this.methods.delete(methodName);
				this.methodOwners.delete(methodName);
			}
		}

		for (const [globalName, owner] of this.sandboxGlobalOwners) {
			if (owner.pluginId === pluginId) {
				this.sandboxGlobals.delete(globalName);
				this.sandboxGlobalOwners.delete(globalName);
			}
		}

		for (const [permission, owner] of this.permissionOwners) {
			if (
				owner.pluginId === pluginId &&
				!this.hasMethodsForPermission(permission) &&
				!this.hasSandboxGlobalsForPermission(permission) &&
				!this.hasCompoundRulesForPermission(permission)
			) {
				this.permissionDefinitions.delete(permission);
				this.permissionOwners.delete(permission);
			}
		}
	}

	getKnownPermissions(): ReadonlySet<PermissionId> {
		return new Set([
			...[...this.permissionDefinitions.values()]
				.filter(permission => permission.standalone === true || this.hasMethodsForPermission(permission.id))
				.map(permission => permission.id),
			...[...this.methods.values()].map(method => method.permission),
			...[...this.sandboxGlobals.values()].flatMap(global => (global.permission === undefined ? [] : [global.permission])),
		]);
	}

	getBuiltInLowRiskPermissions(): PermissionId[] {
		return [...this.builtInPermissionIds]
			.filter(permission => this.getKnownPermissions().has(permission) && this.permissionDefinitions.get(permission)?.severity === 'low')
			.sort();
	}

	getCompoundPermissionRules(): CompoundPermissionRuleDefinition[] {
		return [...this.compoundPermissionRules.values()];
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

	getSandboxGlobals(grantedPermissions: ReadonlySet<PermissionId>): WorkerSandboxGlobal[] {
		return [...this.sandboxGlobals.values()]
			.filter(global => global.permission === undefined || grantedPermissions.has(global.permission))
			.map(global => ({
				name: global.name,
				value: global.value,
			}));
	}

	getSandboxGlobalNames(): string[] {
		return [...this.sandboxGlobals.keys()];
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
						ownerPluginId: this.methodOwners.get(method.method)?.pluginId,
						ownerPluginName: this.methodOwners.get(method.method)?.pluginName,
					}))
					.sort((left, right) => left.apiPath.localeCompare(right.apiPath)),
				globals: [...this.sandboxGlobals.values()]
					.filter(global => global.permission === permission.id)
					.map(global => ({
						name: global.name,
						description: global.description,
						permission: global.permission,
						ownerPluginId: this.sandboxGlobalOwners.get(global.name)?.pluginId,
						ownerPluginName: this.sandboxGlobalOwners.get(global.name)?.pluginName,
					}))
					.sort((left, right) => left.name.localeCompare(right.name)),
				ownerPluginId: this.permissionOwners.get(permission.id)?.pluginId,
				ownerPluginName: this.permissionOwners.get(permission.id)?.pluginName,
			}))
			.filter(group => group.permission.standalone === true || group.methods.length > 0 || group.globals.length > 0);

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

		const requestResult = this.validators.validate(method.requestValidator, params, {
			method: methodName,
			direction: 'request',
		});
		if (!requestResult.success) {
			return {
				ok: false,
				error: {
					code: 'invalid-rpc-request',
					message: `Invalid request for RPC method '${methodName}': ${requestResult.message}`,
				},
			};
		}

		try {
			const rawResult = await method.handler(requestResult.data, context);
			const responseResult = this.validators.validate(method.responseValidator, rawResult, {
				method: methodName,
				direction: 'response',
			});
			if (!responseResult.success) {
				return {
					ok: false,
					error: {
						code: 'invalid-rpc-response',
						message: `RPC method '${methodName}' returned an invalid response: ${responseResult.message}`,
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

	private addCompoundPermissionRule(rule: CompoundPermissionRuleDefinition, owner: RpcRegistrationOwner = {}): void {
		if (!COMPOUND_RULE_ID_PATTERN.test(rule.id)) {
			throw new Error(`Invalid compound permission rule id '${rule.id}'.`);
		}
		if (this.compoundPermissionRules.has(rule.id)) {
			throw new Error(`Duplicate compound permission rule '${rule.id}'.`);
		}
		if (rule.permissions.length < MINIMUM_COMPOUND_RULE_PERMISSIONS) {
			throw new Error(`Compound permission rule '${rule.id}' must contain at least two permission patterns.`);
		}
		if (new Set(rule.permissions).size !== rule.permissions.length) {
			throw new Error(`Compound permission rule '${rule.id}' must not contain duplicate permission patterns.`);
		}
		if (!PERMISSION_SEVERITIES.has(rule.severity)) {
			throw new Error(`Invalid severity '${rule.severity}' in compound permission rule '${rule.id}'.`);
		}
		if (rule.description.trim() === '') {
			throw new Error(`Compound permission rule '${rule.id}' must have a description.`);
		}
		for (const pattern of rule.permissions) {
			if (!matchesPermissionPattern(pattern, new Set(this.permissionDefinitions.keys()))) {
				throw new Error(`Unknown permission pattern '${pattern}' in compound permission rule '${rule.id}'.`);
			}
		}
		this.compoundPermissionRules.set(rule.id, { ...rule, permissions: [...rule.permissions] });
		this.compoundPermissionRuleOwners.set(rule.id, owner);
	}

	private hasSandboxGlobalsForPermission(permission: PermissionId): boolean {
		return [...this.sandboxGlobals.values()].some(global => global.permission === permission);
	}

	private hasCompoundRulesForPermission(permission: PermissionId): boolean {
		return this.findCompoundRuleForPermission(permission) !== undefined;
	}

	private assertPermissionCanBeUnregistered(permission: PermissionId): void {
		if (this.hasMethodsForPermission(permission)) {
			throw new Error(`Cannot unregister permission '${permission}' while RPC methods still use it.`);
		}
		if (this.hasSandboxGlobalsForPermission(permission)) {
			throw new Error(`Cannot unregister permission '${permission}' while sandbox globals still use it.`);
		}

		const dependentRule = this.findCompoundRuleForPermission(permission);
		if (dependentRule !== undefined) {
			throw new Error(`Cannot unregister permission '${permission}' while compound permission rule '${dependentRule.id}' uses it.`);
		}
	}

	private findCompoundRuleForPermission(permission: PermissionId): CompoundPermissionRuleDefinition | undefined {
		const selectedPermission = new Set([permission]);
		return [...this.compoundPermissionRules.values()].find(rule => rule.permissions.some(pattern => matchesPermissionPattern(pattern, selectedPermission)));
	}

	private assertKnownValidator(reference: SafeJsValidatorReference<unknown>, methodName: string, direction: 'request' | 'response'): void {
		if (typeof reference === 'string' && !this.validators.has(reference)) {
			throw new Error(`Unknown ${direction} validator '${reference}' for RPC method '${methodName}'.`);
		}
	}
}

function isValidatorList(value: BuiltInValidatorOptions | readonly SafeJsValidator[]): value is readonly SafeJsValidator[] {
	return Array.isArray(value);
}

function createUnregisterCallback(unregister: () => void): () => void {
	let registered = true;
	return (): void => {
		if (!registered) return;
		unregister();
		registered = false;
	};
}
