import { isIdentifierName, isKeyword, isStrictBindReservedWord } from '@babel/helper-validator-identifier';

const SES_PROTECTED_GLOBAL_NAMES = ['Infinity', 'NaN', '__proto__', 'globalThis', 'undefined'] as const;
export const RESERVED_SANDBOX_GLOBAL_NAMES = ['Temporal', 'api', 'console', 'utils', ...SES_PROTECTED_GLOBAL_NAMES] as const;

const reservedSandboxGlobalNames = new Set<string>(RESERVED_SANDBOX_GLOBAL_NAMES);

export function isReservedSandboxGlobalName(name: string): boolean {
	return reservedSandboxGlobalNames.has(name);
}

export function isUsableSandboxGlobalName(name: string): boolean {
	return isStrictBindingIdentifier(name) && !isReservedSandboxGlobalName(name);
}

export function isUsableExpressionInputName(name: string): boolean {
	return isUsableSandboxGlobalName(name);
}

function isStrictBindingIdentifier(name: string): boolean {
	// Expressions execute in strict async functions, so module/async and strict binding restrictions all apply.
	return isIdentifierName(name) && !isKeyword(name) && !isStrictBindReservedWord(name, true);
}
