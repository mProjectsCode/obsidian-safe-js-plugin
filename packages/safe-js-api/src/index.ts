import type { App, Plugin } from 'obsidian';

export const SAFE_JS_PLUGIN_ID = 'safe-js';

export type PermissionId = `${string}:${string}`;
export type PermissionPattern = PermissionId;
export type PermissionSeverity = 'low' | 'medium' | 'high' | 'critical';
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type SafeJsApprovalMode = 'prompt' | 'skip-missing';
export type SafeJsExecutionFailureStatus =
	| 'permission-denied'
	| 'policy-error'
	| 'parse-error'
	| 'validation-error'
	| 'runtime-error'
	| 'timeout'
	| 'cancelled';
export type SafeJsOutputFormat = 'text' | 'markdown' | 'html';
export type SandboxParamStyle = 'object' | 'path' | 'optionalPath' | 'args';

export interface PermissionDefinition {
	id: PermissionId;
	name: string;
	description: string;
	severity: PermissionSeverity;
	grantGuidance: string;
	standalone?: boolean;
}

export interface SafeJsExecutionSource {
	path?: string;
	lineStart?: number;
	callerPluginId?: string;
	callerPluginName?: string;
}

export type SafeJsPermissionPolicy =
	| { mode: 'none' }
	| { mode: 'restrict'; permissions?: PermissionPattern[]; maxSeverity?: PermissionSeverity }
	| { mode: 'set'; permissions: PermissionPattern[] };

export interface SafeJsExecutionOptions {
	source?: SafeJsExecutionSource;
	debug?: boolean;
	approvalMode?: SafeJsApprovalMode;
	timeoutMs?: number | null;
	signal?: AbortSignal;
	permissionPolicy?: SafeJsPermissionPolicy;
}

export interface SafeJsExpressionOptions extends Omit<SafeJsExecutionOptions, 'permissionPolicy'> {
	permissions?: PermissionPattern[];
	inputs?: Record<string, JsonValue>;
}

export interface SafeJsExecutionSuccess {
	status: 'success';
	codeHash: string;
	value: JsonValue;
	permissions: PermissionId[];
	elapsedMs: number;
}

export interface SafeJsExecutionFailure {
	status: SafeJsExecutionFailureStatus;
	codeHash: string;
	message: string;
	permissions: PermissionId[];
	elapsedMs: number;
}

export type SafeJsExecutionResult = SafeJsExecutionSuccess | SafeJsExecutionFailure;

export interface SafeJsRenderedOutput {
	[key: string]: JsonValue;
	format: SafeJsOutputFormat;
	content: string;
}

export interface SafeJsValidationContext {
	method?: string;
	direction?: 'request' | 'response' | 'manual';
	validatorId?: string;
}

export interface SafeJsValidationSuccess<T = unknown> {
	success: true;
	data: T;
}

export interface SafeJsValidationFailure {
	success: false;
	message: string;
}

export type SafeJsValidationResult<T = unknown> = SafeJsValidationSuccess<T> | SafeJsValidationFailure;

export interface SafeJsValidator<T = unknown> {
	id: string;
	description: string;
	validate(value: unknown, context: SafeJsValidationContext): SafeJsValidationResult<T>;
}

export type SafeJsValidationFunction<T = unknown> = (value: unknown, context: SafeJsValidationContext) => SafeJsValidationResult<T>;
export type SafeJsValidatorReference<T = unknown> = string | SafeJsValidator<T> | SafeJsValidationFunction<T>;
export type SandboxValidatorReference<T = unknown> = SafeJsValidatorReference<T>;

export interface SafeJsRegistration {
	unregister(): void;
}

export interface CompoundPermissionRuleDefinition {
	id: string;
	permissions: PermissionPattern[];
	severity: PermissionSeverity;
	description: string;
}

export interface SandboxCallContext {
	grantedPermissions: ReadonlySet<PermissionId>;
	codeHash?: string;
	signal?: AbortSignal;
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
	paramStyle: SandboxParamStyle;
	argNames?: string[];
	requestValidator: SandboxValidatorReference<TParams>;
	responseValidator: SandboxValidatorReference<TResult>;
	handler(params: TParams, context: SandboxCallContext): Promise<TResult> | TResult;
}

export interface SandboxGlobalDefinition {
	name: string;
	description: string;
	value: JsonValue;
	permission?: PermissionId;
}

export interface SafeJsPublicApi {
	forPlugin(plugin: Plugin): SafeJsCallerApi;
}

export interface SafeJsCallerApi {
	execute(code: string, options?: SafeJsExecutionOptions): Promise<SafeJsExecutionResult>;
	executeExpression(expression: string, options?: SafeJsExpressionOptions): Promise<SafeJsExecutionResult>;
	validate<T = unknown>(validator: SafeJsValidatorReference<T>, value: unknown, context?: SafeJsValidationContext): SafeJsValidationResult<T>;
	getValidatorIds(): string[];
	registerPermission(definition: PermissionDefinition): SafeJsRegistration;
	registerCompoundPermissionRule(definition: CompoundPermissionRuleDefinition): SafeJsRegistration;
	registerSandboxFunction<TParams = unknown, TResult = unknown>(definition: SandboxFunctionDefinition<TParams, TResult>): SafeJsRegistration;
	registerSandboxGlobal(definition: SandboxGlobalDefinition): SafeJsRegistration;
}

export interface SafeJsPlugin extends Plugin {
	api: SafeJsPublicApi;
}

interface ObsidianPluginManager {
	getPlugin(pluginId: string): unknown;
}

interface AppWithPluginManager extends App {
	plugins?: ObsidianPluginManager;
}

export function getSafeJsPlugin(app: App): SafeJsPlugin | undefined {
	const plugin = (app as AppWithPluginManager).plugins?.getPlugin(SAFE_JS_PLUGIN_ID);

	if (isSafeJsPlugin(plugin)) {
		return plugin;
	}

	return undefined;
}

export function getSafeJsApi(app: App, callerPlugin: Plugin): SafeJsCallerApi | undefined {
	return getSafeJsPlugin(app)?.api.forPlugin(callerPlugin);
}

function isSafeJsPlugin(value: unknown): value is SafeJsPlugin {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const candidate = value as Partial<SafeJsPlugin>;
	return typeof candidate.api?.forPlugin === 'function';
}
