export type PermissionId = `${string}:${string}`;
export type PermissionSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface PermissionDefinition {
	id: PermissionId;
	name: string;
	description: string;
	severity: PermissionSeverity;
	grantGuidance: string;
}

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
	{
		id: 'core:read',
		name: 'Read app information',
		description: 'Read basic Obsidian and device information, without local filesystem paths.',
		severity: 'low',
		grantGuidance: 'Grant this when a script needs to adapt to the current app version, language, theme, or platform.',
	},
	{
		id: 'vault:read',
		name: 'Read vault files',
		description: 'Read file names, folder names, file metadata, and file contents from this vault.',
		severity: 'high',
		grantGuidance: 'Grant this only when the script needs to inspect notes or vault structure.',
	},
	{
		id: 'metadata:read',
		name: 'Read note metadata',
		description: 'Read Obsidian metadata such as links, tags, headings, blocks, aliases, and frontmatter.',
		severity: 'high',
		grantGuidance: 'Grant this when the script needs parsed note structure rather than raw file text.',
	},
	{
		id: 'vault:create',
		name: 'Create vault files',
		description: 'Create new files, folders, or copies in the vault without overwriting existing paths.',
		severity: 'high',
		grantGuidance: 'Grant this when the script should add new vault content.',
	},
	{
		id: 'vault:modify',
		name: 'Modify vault files',
		description: 'Change existing file contents in the vault, including appending text or binary data.',
		severity: 'critical',
		grantGuidance: 'Grant this only when you trust the script to edit existing notes or attachments.',
	},
	{
		id: 'vault:move',
		name: 'Move vault items',
		description: 'Rename or move files and folders. Some methods may also update links in other notes.',
		severity: 'critical',
		grantGuidance: 'Grant this only when the script is expected to reorganize vault content.',
	},
	{
		id: 'vault:delete',
		name: 'Delete vault items',
		description: 'Trash or permanently delete files and folders from the vault.',
		severity: 'critical',
		grantGuidance: "Grant this only when deletion is the script's main purpose and you trust the source.",
	},
	{
		id: 'workspace:read',
		name: 'Read workspace state',
		description: 'Read active file identity, recent files, leaves, layout, and active editor state.',
		severity: 'medium',
		grantGuidance: 'Grant this when a script needs to understand what is open or active in Obsidian.',
	},
	{
		id: 'workspace:navigate',
		name: 'Navigate workspace',
		description: 'Open existing files or views and change active panes without editing vault content.',
		severity: 'medium',
		grantGuidance: 'Grant this when a script should move focus or open existing vault files.',
	},
	{
		id: 'editor:read',
		name: 'Read active editor',
		description: 'Read unsaved text, selections, cursor positions, scroll state, and active editor content.',
		severity: 'high',
		grantGuidance: 'Grant this when the script needs the text or state currently open in the editor.',
	},
	{
		id: 'editor:write',
		name: 'Write active editor',
		description: 'Modify unsaved editor text, selections, cursor position, focus, history, or scroll state.',
		severity: 'critical',
		grantGuidance: 'Grant this only when the script should directly edit the active note.',
	},
	{
		id: 'file-manager:read',
		name: 'Read file manager helpers',
		description: 'Read Obsidian file-placement and Markdown-link helper results.',
		severity: 'medium',
		grantGuidance: 'Grant this when a script needs Obsidian-compatible destination folders or links.',
	},
	{
		id: 'ui:notify',
		name: 'Show notices',
		description: 'Display short notices inside Obsidian.',
		severity: 'low',
		grantGuidance: 'Grant this when a script should show brief progress or result messages.',
	},
	{
		id: 'network:request',
		name: 'Make network requests',
		description: 'Send script-provided data to HTTP or HTTPS services and read their responses.',
		severity: 'critical',
		grantGuidance: 'Grant this only when you expect the script to contact external services.',
	},
	{
		id: 'storage:read',
		name: 'Read Safe JS storage',
		description: "Read this plugin's own script storage keys, not arbitrary vault or Obsidian storage.",
		severity: 'medium',
		grantGuidance: 'Grant this when the script needs data it previously stored through Safe JS.',
	},
	{
		id: 'storage:write',
		name: 'Write Safe JS storage',
		description: "Write this plugin's own script storage keys.",
		severity: 'medium',
		grantGuidance: 'Grant this when the script needs to save small plugin-scoped state.',
	},
];

const permissionDefinitionById = new Map<PermissionId, PermissionDefinition>(PERMISSION_DEFINITIONS.map(definition => [definition.id, definition]));

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

export function getPermissionDefinition(permission: PermissionId): PermissionDefinition | undefined {
	return permissionDefinitionById.get(permission);
}
