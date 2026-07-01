import type {
	CompoundPermissionRuleDefinition,
	PermissionId,
	PermissionPattern,
	PermissionSeverity,
	SafeJsPermissionPolicy,
} from '@lemons_dev/obsidian-safe-js-api';
import { expandPermissionGroups, matchesPermissionPattern, parseLeadingPermissions } from 'packages/obsidian/src/permissions/permissions';
import type { RpcRegistry } from 'packages/obsidian/src/rpc/rpc-registry';

// Permission severities are an ordered ceiling, not independent labels.
const PERMISSION_SEVERITY_RANK: Record<PermissionSeverity, number> = {
	low: 0,
	medium: 1,
	high: 2,
	critical: 3,
};

export class PermissionPolicyError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PermissionPolicyError';
	}
}

export class PermissionPolicyResolver {
	constructor(private readonly rpcRegistry: RpcRegistry) {}

	resolveScript(code: string, policy: SafeJsPermissionPolicy = { mode: 'none' }): PermissionId[] {
		const parsed = parseLeadingPermissions(code);
		const knownPermissions = this.rpcRegistry.getKnownPermissions();

		if (policy.mode === 'set') {
			if (parsed.permissions.length > 0) {
				throw new PermissionPolicyError('Permission comments are not allowed when the caller sets permissions.');
			}
			return this.expandPolicyPatterns(policy.permissions, knownPermissions);
		}

		const requested = expandPermissionGroups(parsed.permissions, knownPermissions);
		if (policy.mode === 'none') {
			return requested;
		}

		if (policy.permissions === undefined && policy.maxSeverity === undefined) {
			throw new PermissionPolicyError('A restrict permission policy must define permissions, maxSeverity, or both.');
		}

		if (policy.permissions !== undefined) {
			const allowed = new Set(this.expandPolicyPatterns(policy.permissions, knownPermissions));
			const disallowed = requested.filter(permission => !allowed.has(permission));
			if (disallowed.length > 0) {
				throw new PermissionPolicyError(`The script requested permissions excluded by its caller policy: ${disallowed.join(', ')}.`);
			}
		}

		if (policy.maxSeverity !== undefined) {
			this.assertSeverity(requested, policy.maxSeverity);
		}

		return requested;
	}

	resolveExpression(code: string, patterns: readonly PermissionPattern[] = []): PermissionId[] {
		const parsed = parseLeadingPermissions(code);
		if (parsed.permissions.length > 0) {
			throw new PermissionPolicyError('Permission comments are not allowed in expressions. The caller must set expression permissions.');
		}
		return this.expandPolicyPatterns(patterns, this.rpcRegistry.getKnownPermissions());
	}

	getMatchedCompoundRules(permissions: ReadonlySet<PermissionId>): CompoundPermissionRuleDefinition[] {
		return this.rpcRegistry.getCompoundPermissionRules().filter(rule => rule.permissions.every(pattern => matchesPermissionPattern(pattern, permissions)));
	}

	getAutoAllowablePermissions(
		missingPermissions: readonly PermissionId[],
		matchedCompoundRules: readonly CompoundPermissionRuleDefinition[],
	): PermissionId[] {
		const elevatedRules = matchedCompoundRules.filter(rule => isSeverityAbove(rule.severity, 'low'));
		return missingPermissions.filter(permission => {
			if (this.rpcRegistry.getPermissionDefinition(permission)?.severity !== 'low') {
				return false;
			}

			return !elevatedRules.some(rule => rule.permissions.some(pattern => matchesPermissionPattern(pattern, new Set([permission]))));
		});
	}

	private assertSeverity(permissions: readonly PermissionId[], maximum: PermissionSeverity): void {
		for (const permission of permissions) {
			const severity = this.rpcRegistry.getPermissionDefinition(permission)?.severity;
			if (severity !== undefined && isSeverityAbove(severity, maximum)) {
				throw new PermissionPolicyError(`Permission '${permission}' has ${severity} severity, above the ${maximum} policy ceiling.`);
			}
		}

		for (const rule of this.getMatchedCompoundRules(new Set(permissions))) {
			if (isSeverityAbove(rule.severity, maximum)) {
				throw new PermissionPolicyError(`Permission combination '${rule.id}' has ${rule.severity} severity, above the ${maximum} policy ceiling.`);
			}
		}
	}

	private expandPolicyPatterns(patterns: readonly PermissionPattern[], knownPermissions: ReadonlySet<PermissionId>): PermissionId[] {
		try {
			return expandPermissionGroups(patterns, knownPermissions);
		} catch (error) {
			throw new PermissionPolicyError(error instanceof Error ? error.message : 'Invalid permission policy.');
		}
	}
}

function isSeverityAbove(severity: PermissionSeverity, maximum: PermissionSeverity): boolean {
	return PERMISSION_SEVERITY_RANK[severity] > PERMISSION_SEVERITY_RANK[maximum];
}
