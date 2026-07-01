export interface BuiltInSandboxGlobalDoc {
	name: string;
	description: string;
}

export const SANDBOX_GLOBALS: BuiltInSandboxGlobalDoc[] = [
	{
		name: 'Temporal',
		description: 'Hardened Temporal date and time API backed by a worker-local polyfill.',
	},
	{
		name: 'api',
		description: 'Permission-gated Safe JS functions exposed through the RPC layer.',
	},
	{
		name: 'console',
		description: 'Local worker console methods for debugging. Console output is not sent over the network by Safe JS.',
	},
	{
		name: 'utils',
		description: 'Permissionless worker-local Temporal, link, file, tag, and display helpers in normal script mode.',
	},
];
