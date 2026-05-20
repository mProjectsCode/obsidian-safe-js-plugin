import type { WorkspaceLeaf } from 'obsidian';
import { ItemView } from 'obsidian';
import { SANDBOX_GLOBALS } from 'packages/obsidian/src/execution/sandbox-globals';
import type { RpcDocsPermission, RpcRegistry } from 'packages/obsidian/src/rpc/rpc-registry';

export const SAFE_JS_DOCS_VIEW_TYPE = 'safe-js-docs';

export class SafeJsDocsView extends ItemView {
	private readonly rpcRegistry: RpcRegistry;

	constructor(leaf: WorkspaceLeaf, rpcRegistry: RpcRegistry) {
		super(leaf);
		this.rpcRegistry = rpcRegistry;
	}

	getViewType(): string {
		return SAFE_JS_DOCS_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Safe js API';
	}

	getIcon(): string {
		return 'braces';
	}

	protected async onOpen(): Promise<void> {
		this.render();
	}

	private render(): void {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass('safe-js-docs-view');
		container.createEl('h2', { text: 'Safe js API' });
		container.createEl('p', {
			text: 'Scripts can only use functions listed here after declaring and approving the required permission.',
		});

		for (const group of this.rpcRegistry.getDocs()) {
			this.renderPermissionGroup(container, group);
		}

		this.renderSandboxGlobals(container);
	}

	private renderPermissionGroup(container: HTMLElement, group: RpcDocsPermission): void {
		const section = container.createEl('section');
		section.createEl('h3', { text: group.permission.name });
		section.createEl('p', { text: `${group.permission.id} - ${formatSeverity(group.permission.severity)}` });
		section.createEl('p', { text: group.permission.description });
		section.createEl('p', { text: group.permission.grantGuidance });
		if (group.ownerPluginName !== undefined) {
			section.createEl('p', { text: `Provided by ${group.ownerPluginName}.` });
		}

		if (group.methods.length > 0) {
			const list = section.createEl('ul');
			for (const rpcMethod of group.methods) {
				const item = list.createEl('li');
				item.createEl('code', { text: rpcMethod.usage });
				item.createSpan({ text: ` - ${rpcMethod.description}` });
			}
		}

		if (group.globals.length > 0) {
			const list = section.createEl('ul');
			for (const globalDefinition of group.globals) {
				const item = list.createEl('li');
				item.createEl('code', { text: globalDefinition.name });
				item.createSpan({ text: ` - ${globalDefinition.description}` });
			}
		}
	}

	private renderSandboxGlobals(container: HTMLElement): void {
		const section = container.createEl('section');
		section.createEl('h3', { text: 'Sandbox globals' });
		const list = section.createEl('ul');
		for (const globalDefinition of SANDBOX_GLOBALS) {
			const item = list.createEl('li');
			item.createEl('code', { text: globalDefinition.name });
			item.createSpan({ text: ` - ${globalDefinition.description}` });
		}
	}
}

function formatSeverity(severity: string): string {
	return `${severity.slice(0, 1).toUpperCase()}${severity.slice(1)} risk`;
}
