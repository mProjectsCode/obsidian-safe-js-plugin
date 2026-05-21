import type { App } from 'obsidian';
import { Component, MarkdownRenderer, Modal, sanitizeHTMLToDom } from 'obsidian';
import type { SafeJsRenderedOutput } from 'packages/obsidian/src/output/output-format';

export class SafeJsOutputRenderer {
	private readonly app: App;

	constructor(app: App) {
		this.app = app;
	}

	async render(output: SafeJsRenderedOutput, containerEl: HTMLElement, sourcePath: string, component: Component): Promise<void> {
		containerEl.empty();

		if (output.format === 'markdown') {
			await MarkdownRenderer.render(this.app, output.content, containerEl, sourcePath, component);
			return;
		}

		if (output.format === 'html') {
			containerEl.appendChild(sanitizeHTMLToDom(output.content));
			return;
		}

		containerEl.createEl('pre', { text: output.content });
	}
}

export class SafeJsOutputModal extends Modal {
	private readonly output: SafeJsRenderedOutput;
	private readonly renderComponent = new Component();
	private readonly sourcePath: string;
	private readonly title: string;

	constructor(app: App, title: string, output: SafeJsRenderedOutput, sourcePath: string) {
		super(app);
		this.title = title;
		this.output = output;
		this.sourcePath = sourcePath;
	}

	override async onOpen(): Promise<void> {
		this.setTitle(this.title);
		this.contentEl.empty();
		this.renderComponent.load();
		await new SafeJsOutputRenderer(this.app).render(this.output, this.contentEl, this.sourcePath, this.renderComponent);
	}

	override onClose(): void {
		this.renderComponent.unload();
		this.contentEl.empty();
	}
}
