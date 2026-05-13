import type { App } from 'obsidian';
import { createCoreMethods } from 'packages/obsidian/src/rpc/obsidian/core-rpc';
import { createEditorMethods } from 'packages/obsidian/src/rpc/obsidian/editor-rpc';
import { createHelperMethods } from 'packages/obsidian/src/rpc/obsidian/helper-rpc';
import { createFileManagerMethods, createNetworkMethods, createStorageMethods, createUiMethods } from 'packages/obsidian/src/rpc/obsidian/host-rpc';
import { createMetadataMethods } from 'packages/obsidian/src/rpc/obsidian/metadata-rpc';
import {
	createVaultCreateMethods,
	createVaultDeleteMethods,
	createVaultModifyMethods,
	createVaultMoveMethods,
	createVaultReadMethods,
} from 'packages/obsidian/src/rpc/obsidian/vault-rpc';
import { createWorkspaceMethods } from 'packages/obsidian/src/rpc/obsidian/workspace-rpc';
import { RpcRegistry } from 'packages/obsidian/src/rpc/rpc-registry';

export function createSafeJsRpcRegistry(app: App): RpcRegistry {
	return new RpcRegistry([
		...createCoreMethods(app),
		...createHelperMethods(),
		...createVaultReadMethods(app),
		...createMetadataMethods(app),
		...createVaultCreateMethods(app),
		...createVaultModifyMethods(app),
		...createVaultMoveMethods(app),
		...createVaultDeleteMethods(app),
		...createWorkspaceMethods(app),
		...createEditorMethods(app),
		...createFileManagerMethods(app),
		...createUiMethods(),
		...createNetworkMethods(),
		...createStorageMethods(app),
	]);
}
