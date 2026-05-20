import type { SafeJsExecutionOptions, SafeJsExecutionResult } from 'packages/obsidian/src/execution/contracts';
import type { WorkerFactory } from 'packages/obsidian/src/execution/worker-client';
import type { ActiveExecution } from 'packages/obsidian/src/execution/worker-execution-session';
import { WorkerExecutionSession } from 'packages/obsidian/src/execution/worker-execution-session';
import type { PermissionApprovalStore, PermissionApprovalSubject } from 'packages/obsidian/src/permissions/approval-store';
import { hashCode } from 'packages/obsidian/src/permissions/hash';
import type { PermissionId } from 'packages/obsidian/src/permissions/permissions';
import { assertKnownPermissions, expandPermissionGroups, parseLeadingPermissions } from 'packages/obsidian/src/permissions/permissions';
import type { RpcRegistry } from 'packages/obsidian/src/rpc/rpc-registry';

export interface PermissionPromptRequest {
	codeHash: string;
	callerPluginId?: string;
	callerPluginName?: string;
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
		const approvalSubject: PermissionApprovalSubject = {
			codeHash,
			callerPluginId: options.source?.callerPluginId,
		};
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

		const approval = this.approvalStore.load(approvalSubject);
		const approvedPermissions = new Set(approval?.permissions ?? []);
		const missingPermissions = permissions.filter(permission => !approvedPermissions.has(permission));
		const autoApprovedPermissions = this.getAutoAllowLowRiskPermissions()
			? missingPermissions.filter(permission => this.isLowRiskPermission(permission))
			: [];
		const promptedPermissions = missingPermissions.filter(permission => !autoApprovedPermissions.includes(permission));

		if (promptedPermissions.length > 0) {
			const approved = await this.permissionPrompt.requestApproval({
				codeHash,
				callerPluginId: options.source?.callerPluginId,
				callerPluginName: options.source?.callerPluginName,
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
				callerPluginId: approvalSubject.callerPluginId,
				permissions: [...new Set([...approvedPermissions, ...newlyApprovedPermissions])],
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
}
