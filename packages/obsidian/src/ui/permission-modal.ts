import type { App } from 'obsidian';
import { Modal, Setting } from 'obsidian';
import type { PermissionPrompt, PermissionPromptRequest } from 'packages/obsidian/src/execution/execution-service';

export class ObsidianPermissionPrompt implements PermissionPrompt {
	private readonly app: App;

	constructor(app: App) {
		this.app = app;
	}

	async requestApproval(request: PermissionPromptRequest): Promise<boolean> {
		return await new Promise<boolean>(resolve => {
			new PermissionApprovalModal(this.app, request, resolve).open();
		});
	}
}

class PermissionApprovalModal extends Modal {
	private readonly onResolve: (approved: boolean) => void;
	private readonly request: PermissionPromptRequest;
	private resolved = false;

	constructor(app: App, request: PermissionPromptRequest, onResolve: (approved: boolean) => void) {
		super(app);
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

		const list = contentEl.createEl('ul');
		for (const permission of this.request.permissions) {
			list.createEl('li', { text: permission });
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
}
