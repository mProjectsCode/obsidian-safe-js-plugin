import type { App } from 'obsidian';
import type { TextComponent } from 'obsidian';
import { Modal, Notice, Setting } from 'obsidian';
import { isJavaScriptVaultScriptPath } from 'packages/obsidian/src/scripts/script-settings';

export interface AddVaultScriptModalValues {
	name: string;
	path: string;
	runOnStartup: boolean;
}

export interface AddVaultScriptModalSubmitResult {
	message?: string;
	saved: boolean;
}

export interface AddVaultScriptModalOptions {
	actionText: string;
	initialValues: AddVaultScriptModalValues;
	title: string;
}

export class AddVaultScriptModal extends Modal {
	private readonly actionText: string;
	private readonly onSubmit: (values: AddVaultScriptModalValues) => Promise<AddVaultScriptModalSubmitResult>;
	private readonly title: string;
	private path: string;
	private name: string;
	private runOnStartup: boolean;

	constructor(app: App, options: AddVaultScriptModalOptions, onSubmit: (values: AddVaultScriptModalValues) => Promise<AddVaultScriptModalSubmitResult>) {
		super(app);
		this.actionText = options.actionText;
		this.name = options.initialValues.name;
		this.onSubmit = onSubmit;
		this.path = options.initialValues.path;
		this.runOnStartup = options.initialValues.runOnStartup;
		this.title = options.title;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: this.title });
		let pathInput: TextComponent | undefined;

		new Setting(contentEl)
			.setName('Vault path')
			.setDesc('Use a vault-relative path that ends in .js.')
			.addText(text => {
				pathInput = text;
				return text
					.setPlaceholder('Scripts/example.js')
					.setValue(this.path)
					.onChange(value => {
						this.path = value;
					});
			});

		new Setting(contentEl)
			.setName('Command name')
			.setDesc('Leave blank to use the file name.')
			.addText(text =>
				text
					.setPlaceholder('Example script')
					.setValue(this.name)
					.onChange(value => {
						this.name = value;
					}),
			);

		new Setting(contentEl)
			.setName('Run on startup')
			.setDesc('Run this script when Obsidian finishes loading.')
			.addToggle(toggle =>
				toggle.setValue(this.runOnStartup).onChange(value => {
					this.runOnStartup = value;
				}),
			);

		new Setting(contentEl)
			.addButton(button =>
				button.setButtonText('Cancel').onClick(() => {
					this.close();
				}),
			)
			.addButton(button =>
				button
					.setButtonText(this.actionText)
					.setCta()
					.onClick(() => {
						void this.submit();
					}),
			);

		pathInput?.inputEl.focus();
	}

	private async submit(): Promise<void> {
		const normalizedPath = this.path.trim();
		if (normalizedPath === '' || !isJavaScriptVaultScriptPath(normalizedPath)) {
			new Notice('Enter a vault path ending in .js.');
			return;
		}

		const result = await this.onSubmit({
			name: this.name,
			path: normalizedPath,
			runOnStartup: this.runOnStartup,
		});
		if (result.message !== undefined) {
			new Notice(result.message);
		}
		if (result.saved) {
			this.close();
		}
	}
}
