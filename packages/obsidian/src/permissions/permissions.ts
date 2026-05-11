export type PermissionId = `${string}:${string}`;

export interface ParsedPermissions {
	permissions: PermissionId[];
	bodyStartsAtLine: number;
}

export class PermissionParseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PermissionParseError';
	}
}

const permissionPattern = /^\/\/\s*@permission\s+([a-z][a-z0-9-]*:[a-z][a-z0-9-]*)\s*$/u;
const permissionLikePattern = /^\/\/\s*@permission(?:\s+.*)?$/u;

export function parseLeadingPermissions(code: string): ParsedPermissions {
	const permissions: PermissionId[] = [];
	const seenPermissions = new Set<PermissionId>();
	const lines = code.replace(/\r\n?/gu, '\n').split('\n');
	let headerOpen = true;
	let bodyStartsAtLine = 1;

	for (const [index, line] of lines.entries()) {
		const lineNumber = index + 1;
		const trimmedLine = line.trim();

		if (headerOpen && trimmedLine === '') {
			bodyStartsAtLine = lineNumber + 1;
			continue;
		}

		const permissionMatch = permissionPattern.exec(trimmedLine);
		if (headerOpen && permissionMatch !== null) {
			const permission = permissionMatch[1] as PermissionId;
			if (seenPermissions.has(permission)) {
				throw new PermissionParseError(`Duplicate permission '${permission}' on line ${lineNumber}.`);
			}

			seenPermissions.add(permission);
			permissions.push(permission);
			bodyStartsAtLine = lineNumber + 1;
			continue;
		}

		if (permissionLikePattern.test(trimmedLine)) {
			throw new PermissionParseError(
				headerOpen
					? `Malformed permission comment on line ${lineNumber}. Use '// @permission namespace:name'.`
					: `Permission comments must appear before executable code. Found one on line ${lineNumber}.`,
			);
		}

		if (trimmedLine.startsWith('//')) {
			bodyStartsAtLine = lineNumber + 1;
			continue;
		}

		headerOpen = false;
		bodyStartsAtLine = lineNumber;
	}

	return { permissions, bodyStartsAtLine };
}

export function assertKnownPermissions(permissions: readonly PermissionId[], knownPermissions: ReadonlySet<PermissionId>): void {
	const unknownPermission = permissions.find(permission => !knownPermissions.has(permission));
	if (unknownPermission !== undefined) {
		throw new PermissionParseError(`Unknown permission '${unknownPermission}'.`);
	}
}
