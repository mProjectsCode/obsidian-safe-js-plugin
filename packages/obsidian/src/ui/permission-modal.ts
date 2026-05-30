import type { PermissionId } from '@lemons_dev/obsidian-safe-js-api';
import type { App } from 'obsidian';
import { Modal, SettingGroup } from 'obsidian';
import type { PermissionPrompt, PermissionPromptRequest } from 'packages/obsidian/src/execution/execution-service';
import { RICH_OUTPUT_PERMISSION } from 'packages/obsidian/src/permissions/permissions';
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
			if (request.signal?.aborted === true) {
				resolve(false);
				return;
			}

			const modal = new PermissionApprovalModal(this.app, this.rpcRegistry, request, approved => {
				cleanup();
				resolve(approved);
			});
			const abortListener = (): void => {
				modal.close();
			};
			const cleanup = (): void => {
				request.signal?.removeEventListener('abort', abortListener);
			};
			request.signal?.addEventListener('abort', abortListener, { once: true });
			modal.open();
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
		const callerText = this.request.callerPluginName ?? this.request.callerPluginId;
		contentEl.createEl('p', {
			text: `This script is requesting access before it runs. Source: ${sourceText}`,
		});
		if (callerText !== undefined) {
			contentEl.createEl('p', {
				text: `Requested by ${callerText}.`,
			});
		}

		if (this.hasNetworkExfiltrationRisk()) {
			contentEl.createEl('p', {
				text: 'Network access is requested together with read access. This script could send vault or editor data to external services.',
			});
		}
		if (this.hasRichOutputExfiltrationRisk()) {
			contentEl.createEl('p', {
				text: 'Rich output is requested together with read access. Rendered Markdown or HTML can load remote resources, including addresses that contain vault or editor data.',
			});
		}
		if (this.hasVaultWriteRenderRisk()) {
			contentEl.createEl('p', {
				text: 'Vault write access can create Markdown or HTML that loads remote resources later when opened or previewed.',
			});
		}

		const list = contentEl.createEl('ul');
		for (const permission of this.request.permissions) {
			this.renderPermission(list, permission);
		}

		const group = new SettingGroup(contentEl);
		group.addSetting(
			setting =>
				void setting
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
					),
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
		const permissions = this.getAllPermissions();
		const readPermissions: PermissionId[] = ['vault:read', 'metadata:read', 'workspace:read', 'editor:read'];
		return permissions.has('network:request') && readPermissions.some(permission => permissions.has(permission));
	}

	private hasRichOutputExfiltrationRisk(): boolean {
		const permissions = this.getAllPermissions();
		const readPermissions: PermissionId[] = ['vault:read', 'metadata:read', 'workspace:read', 'editor:read'];
		return permissions.has(RICH_OUTPUT_PERMISSION) && readPermissions.some(permission => permissions.has(permission));
	}

	private hasVaultWriteRenderRisk(): boolean {
		const permissions = this.getAllPermissions();
		const writePermissions: PermissionId[] = ['vault:create', 'vault:modify', 'editor:write'];
		return writePermissions.some(permission => permissions.has(permission));
	}

	private getAllPermissions(): Set<PermissionId> {
		return new Set(this.request.allPermissions);
	}
}

function formatSeverity(severity: string): string {
	return `${severity.slice(0, 1).toUpperCase()}${severity.slice(1)} risk`;
}
