export interface SandboxGlobalDefinition {
	name: string;
	description: string;
}

export const SANDBOX_GLOBALS: SandboxGlobalDefinition[] = [
	{
		name: 'api',
		description: 'Permission-gated Safe JS functions exposed through the RPC layer.',
	},
	{
		name: 'console',
		description: 'Local worker console methods for debugging. Console output is not sent over the network by Safe JS.',
	},
];
