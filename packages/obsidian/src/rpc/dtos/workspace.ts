import type { JsonValue } from '@lemons_dev/obsidian-safe-js-api';
import type { App, OpenViewState, ViewState, WorkspaceLeaf } from 'obsidian';
import { TFile } from 'obsidian';
import { isJsonValue, toJsonValue } from 'packages/obsidian/src/execution/json';
import { pickJsonFields } from 'packages/obsidian/src/execution/json-fields';
import { fileToDto } from 'packages/obsidian/src/rpc/dtos/files';
import { isSafeVaultPath } from 'packages/obsidian/src/rpc/vault-files';

export function leafToDto(leaf: WorkspaceLeaf, shouldIncludeFile: (file: TFile) => boolean = () => true): JsonValue {
	const state = leaf.getViewState();
	const leafId = (leaf as { id?: string }).id ?? '';
	const fileView = leaf.view as { file?: unknown };
	const file = fileView.file instanceof TFile && shouldIncludeFile(fileView.file) ? fileView.file : null;
	return toJsonValue({
		id: leafId,
		viewType: state.type,
		active: state.active ?? false,
		pinned: state.pinned ?? false,
		file: file === null ? null : fileToDto(file),
	});
}

export function sanitizeOpenViewState(openState: unknown): OpenViewState | undefined {
	if (!isJsonValue(openState) || openState === null || typeof openState !== 'object' || Array.isArray(openState)) {
		return undefined;
	}

	const state = openState as Record<string, JsonValue>;
	return {
		state: typeof state.state === 'object' && state.state !== null && !Array.isArray(state.state) ? state.state : undefined,
		eState: typeof state.eState === 'object' && state.eState !== null && !Array.isArray(state.eState) ? state.eState : undefined,
		active: typeof state.active === 'boolean' ? state.active : undefined,
	};
}

export function sanitizeViewState(state: ViewState): JsonValue {
	return toJsonValue({
		type: state.type,
		state: state.state,
		active: state.active,
		pinned: state.pinned,
	});
}

export function sanitizeWorkspaceLayout(app: App, layout: unknown): JsonValue {
	if (layout === null || typeof layout !== 'object' || Array.isArray(layout)) {
		return {};
	}

	const source = layout as Record<string, unknown>;
	const sanitized = pickJsonFields(source, {
		id: 'string',
		type: 'string',
		direction: 'string',
		active: 'boolean',
		pinned: 'boolean',
		collapsed: 'boolean',
		width: 'number',
		height: 'number',
		currentTab: 'number',
	});

	if (Array.isArray(source.children)) {
		sanitized.children = source.children.map(child => sanitizeWorkspaceLayout(app, child));
	}

	if (source.state !== null && typeof source.state === 'object' && !Array.isArray(source.state)) {
		const state = source.state as Record<string, unknown>;
		const safeState = pickJsonFields(state, {
			type: 'string',
			active: 'boolean',
			pinned: 'boolean',
		});

		if (state.state !== null && typeof state.state === 'object' && !Array.isArray(state.state)) {
			const viewState = state.state as Record<string, unknown>;
			if (typeof viewState.file === 'string' && isSafeVaultPath(app, viewState.file)) {
				safeState.state = { file: viewState.file };
			}
		}

		sanitized.state = safeState;
	}

	return sanitized;
}
