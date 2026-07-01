import type {
	CompoundPermissionRuleDefinition,
	JsonValue,
	PermissionId,
	SafeJsExecutionOptions,
	SafeJsExecutionResult,
	SafeJsExpressionOptions,
} from '@lemons_dev/obsidian-safe-js-api';
import { validateExpressionInputs } from 'packages/obsidian/src/execution/expression-inputs';
import type { WorkerFactory } from 'packages/obsidian/src/execution/worker-client';
import type { ActiveExecution } from 'packages/obsidian/src/execution/worker-execution-session';
import { WorkerExecutionSession } from 'packages/obsidian/src/execution/worker-execution-session';
import type { PermissionApprovalStore, PermissionApprovalSubject } from 'packages/obsidian/src/permissions/approval-store';
import { hashCode } from 'packages/obsidian/src/permissions/hash';
import { PermissionPolicyError, PermissionPolicyResolver } from 'packages/obsidian/src/permissions/permission-policy';
import type { RpcRegistry } from 'packages/obsidian/src/rpc/rpc-registry';

export interface PermissionPromptRequest {
	allPermissions: PermissionId[];
	codeHash: string;
	callerPluginId?: string;
	callerPluginName?: string;
	permissions: PermissionId[];
	compoundRules: CompoundPermissionRuleDefinition[];
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

interface PermissionApprovalPlan {
	approvedPermissions: Set<PermissionId>;
	autoApprovedPermissions: PermissionId[];
	compoundRules: CompoundPermissionRuleDefinition[];
	promptedPermissions: PermissionId[];
}

export class SafeJsExecutionService {
	private readonly approvalStore: PermissionApprovalStore;
	private readonly createExecutionId: () => string;
	private readonly getAutoAllowLowRiskPermissions: () => boolean;
	private readonly getDefaultTimeoutMs: () => number | null;
	private readonly hashSource: (code: string) => Promise<string>;
	private readonly now: () => number;
	private readonly permissionPrompt: PermissionPrompt;
	private readonly permissionPolicyResolver: PermissionPolicyResolver;
	private readonly rpcRegistry: RpcRegistry;
	private readonly workerFactory: WorkerFactory;
	private readonly activeExecutions = new Set<ActiveExecution>();
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
		this.permissionPolicyResolver = new PermissionPolicyResolver(this.rpcRegistry);
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
		return await this.executeInternal(code, options, 'script', {}, () => this.permissionPolicyResolver.resolveScript(code, options.permissionPolicy));
	}

	async executeExpression(expression: string, options: SafeJsExpressionOptions = {}): Promise<SafeJsExecutionResult> {
		return await this.executeInternal(expression, options, 'expression', options.inputs ?? {}, () => {
			validateExpressionInputs(options.inputs ?? {}, this.rpcRegistry.getSandboxGlobalNames());
			return this.permissionPolicyResolver.resolveExpression(expression, options.permissions);
		});
	}

	private async executeInternal(
		code: string,
		options: SafeJsExecutionOptions | SafeJsExpressionOptions,
		mode: 'script' | 'expression',
		inputs: Record<string, JsonValue>,
		resolvePermissions: () => PermissionId[],
	): Promise<SafeJsExecutionResult> {
		const startedAt = this.now();
		const codeHash = await this.hashSource(code);
		const approvalSubject: PermissionApprovalSubject = {
			codeHash,
			callerPluginId: options.source?.callerPluginId,
		};
		let permissions: PermissionId[] = [];

		try {
			// Capability selection is resolved before approval. A caller-set permission is still subject to the normal user approval flow below.
			permissions = resolvePermissions();
		} catch (error) {
			return {
				status: error instanceof PermissionPolicyError ? 'policy-error' : 'parse-error',
				codeHash,
				message: error instanceof Error ? error.message : 'Unable to parse permissions.',
				permissions,
				elapsedMs: this.now() - startedAt,
			};
		}

		const approvalPlan = this.createPermissionApprovalPlan(approvalSubject, permissions);

		if (options.approvalMode === 'skip-missing' && approvalPlan.promptedPermissions.length > 0) {
			return {
				status: 'permission-denied',
				codeHash,
				message: `Execution skipped because permission approval is required for ${approvalPlan.promptedPermissions.join(', ')}.`,
				permissions,
				elapsedMs: this.now() - startedAt,
			};
		}

		if (approvalPlan.promptedPermissions.length > 0) {
			const approved = await this.permissionPrompt.requestApproval({
				allPermissions: permissions,
				codeHash,
				callerPluginId: options.source?.callerPluginId,
				callerPluginName: options.source?.callerPluginName,
				permissions: approvalPlan.promptedPermissions,
				compoundRules: approvalPlan.compoundRules,
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
					message: `Execution cancelled because permission approval was denied for ${approvalPlan.promptedPermissions.join(', ')}.`,
					permissions,
					elapsedMs: this.now() - startedAt,
				};
			}
		}

		if (options.signal?.aborted === true) {
			return this.createCancelledResult(codeHash, permissions, this.now());
		}

		const newlyApprovedPermissions = [...approvalPlan.autoApprovedPermissions, ...approvalPlan.promptedPermissions];
		if (newlyApprovedPermissions.length > 0) {
			this.approvalStore.save({
				codeHash,
				callerPluginId: approvalSubject.callerPluginId,
				permissions: [...new Set([...approvalPlan.approvedPermissions, ...newlyApprovedPermissions])],
				updatedAt: this.now(),
			});
		}

		return await new WorkerExecutionSession({
			rpcRegistry: this.rpcRegistry,
			workerFactory: this.workerFactory,
			activeExecutions: this.activeExecutions,
			createExecutionId: this.createExecutionId,
			now: this.now,
			clearExecutionTimeout: this.clearExecutionTimeout,
			setExecutionTimeout: this.setExecutionTimeout,
		}).execute({
			code,
			codeHash,
			mode,
			inputs,
			grantedPermissions: new Set(permissions),
			startedAt: this.now(),
			executionOptions: options,
			timeoutMs: options.timeoutMs === undefined ? this.getDefaultTimeoutMs() : options.timeoutMs,
		});
	}

	cancelAll(): void {
		for (const execution of this.activeExecutions) {
			execution.cancel();
		}
		this.activeExecutions.clear();
	}

	getExpressionBlockPermissions(): PermissionId[] {
		// Expression blocks have no trusted caller, so never inherit permissions registered later by third-party plugins.
		return this.getAutoAllowLowRiskPermissions() ? this.rpcRegistry.getBuiltInLowRiskPermissions() : [];
	}

	private createPermissionApprovalPlan(subject: PermissionApprovalSubject, permissions: PermissionId[]): PermissionApprovalPlan {
		const approval = this.approvalStore.load(subject);
		const approvedPermissions = new Set(approval?.permissions ?? []);
		const missingPermissions = permissions.filter(permission => !approvedPermissions.has(permission));
		const compoundRules = this.permissionPolicyResolver.getMatchedCompoundRules(new Set(permissions));
		const autoApprovedPermissions = this.getAutoAllowLowRiskPermissions()
			? this.permissionPolicyResolver.getAutoAllowablePermissions(missingPermissions, compoundRules)
			: [];
		const autoApprovedPermissionSet = new Set(autoApprovedPermissions);

		return {
			approvedPermissions,
			autoApprovedPermissions,
			compoundRules,
			promptedPermissions: missingPermissions.filter(permission => !autoApprovedPermissionSet.has(permission)),
		};
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
}
