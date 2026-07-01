import type { JsonValue } from '@lemons_dev/obsidian-safe-js-api';
import { isJsonValue } from 'packages/obsidian/src/execution/json';
import { isUsableExpressionInputName } from 'packages/obsidian/src/execution/utility-names';
import { PermissionPolicyError } from 'packages/obsidian/src/permissions/permission-policy';

export function validateExpressionInputs(inputs: Record<string, JsonValue>, additionalReservedNames: readonly string[]): void {
	const additionalReservedNameSet = new Set(additionalReservedNames);
	for (const [name, value] of Object.entries(inputs)) {
		if (!isUsableExpressionInputName(name)) {
			throw new PermissionPolicyError(`Expression input '${name}' is not a usable JavaScript identifier.`);
		}
		if (additionalReservedNameSet.has(name)) {
			throw new PermissionPolicyError(`Expression input '${name}' conflicts with a sandbox global.`);
		}
		if (!isJsonValue(value)) {
			throw new PermissionPolicyError(`Expression input '${name}' must be JSON-safe.`);
		}
	}
}
