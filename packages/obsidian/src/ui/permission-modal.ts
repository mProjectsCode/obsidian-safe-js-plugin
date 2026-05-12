import type { App } from 'obsidian';
import { Modal, Setting } from 'obsidian';
import type { PermissionPrompt, PermissionPromptRequest } from 'packages/obsidian/src/execution/execution-service';
import type { PermissionId } from 'packages/obsidian/src/permissions/permissions';
import type { RpcRegistry } from 'packages/obsidian/src/rpc/rpc-registry';

export class ObsidianPermissionPrompt implements PermissionPrompt {
	private readonly app: App;
	private readonly rpcRegistry: RpcRegistry;

	constructor(app: App, rpcRegistry: RpcRegistry) {
		this.app = app;
		this.rpcRegistry = rpcRegistry;
	}

	async requestApproval(request: PermissionPromptRequest): Promise<boolean> {
		return await new Promise<boolean>(resolve => {
			new PermissionApprovalModal(this.app, this.rpcRegistry, request, resolve).open();
		});
	}
}

class PermissionApprovalModal extends Modal {
	private readonly onResolve: (approved: boolean) => void;
	private readonly request: PermissionPromptRequest;
	private readonly rpcRegistry: RpcRegistry;
	private resolved = false;

	constructor(app: App, rpcRegistry: RpcRegistry, request: PermissionPromptRequest, onResolve: (approved: boolean) => void) {
		super(app);
		this.rpcRegistry = rpcRegistry;
		this.request = request;
		this.onResolve = onResolve;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'Allow safe js permissions?' });

		const sourceText = this.request.source?.path ?? 'Unknown source';
		contentEl.createEl('p', {
			text: `This script is requesting access before it runs. Source: ${sourceText}`,
		});

		if (this.hasNetworkExfiltrationRisk()) {
			contentEl.createEl('p', {
				text: 'Network access is requested together with read access. This script could send vault or editor data to external services.',
			});
		}

		const list = contentEl.createEl('ul');
		for (const permission of this.request.permissions) {
			this.renderPermission(list, permission);
		}

		new Setting(contentEl)
			.addButton(button =>
				button.setButtonText('Cancel').onClick(() => {
					this.resolve(false);
				}),
			)
			.addButton(button =>
				button
					.setButtonText('Allow')
					.setCta()
					.onClick(() => {
						this.resolve(true);
					}),
			);
	}

	onClose(): void {
		this.resolve(false);
	}

	private resolve(approved: boolean): void {
		if (this.resolved) {
			return;
		}

		this.resolved = true;
		this.onResolve(approved);
		this.close();
	}

	private renderPermission(list: HTMLElement, permission: PermissionId): void {
		const item = list.createEl('li');
		const definition = this.rpcRegistry.getPermissionDefinition(permission);
		if (definition === undefined) {
			item.setText(permission);
			return;
		}

		item.createEl('strong', { text: `${definition.name} (${definition.id})` });
		item.createEl('p', { text: `${formatSeverity(definition.severity)}. ${definition.description}` });
		item.createEl('p', { text: definition.grantGuidance });

		const methods = this.rpcRegistry
			.getDocs()
			.find(group => group.permission.id === permission)
			?.methods.slice(0, 6);
		if (methods !== undefined && methods.length > 0) {
			const methodList = item.createEl('ul');
			for (const rpcMethod of methods) {
				methodList.createEl('li', { text: rpcMethod.usage });
			}
		}
	}

	private hasNetworkExfiltrationRisk(): boolean {
		const permissions = new Set(this.request.permissions);
		const readPermissions: PermissionId[] = ['vault:read', 'metadata:read', 'workspace:read', 'editor:read'];
		return permissions.has('network:request') && readPermissions.some(permission => permissions.has(permission));
	}
}

function formatSeverity(severity: string): string {
	return `${severity.slice(0, 1).toUpperCase()}${severity.slice(1)} risk`;
}
