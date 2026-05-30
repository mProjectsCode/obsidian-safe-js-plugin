import type { App } from 'obsidian';
import { Notice, SettingGroup, SettingPage } from 'obsidian';
import type { ScriptStorageEntry } from 'packages/obsidian/src/storage/script-storage';
import { ScriptStorageManager } from 'packages/obsidian/src/storage/script-storage';
import {
	ALL_FILTER_VALUE,
	formatBytes,
	formatCount,
	formatDate,
	groupBySorted,
	renderHiddenSettingItemCount,
	visibleSettingItems,
} from 'packages/obsidian/src/ui/settings/setting-page-utils';

export class ScriptStorageSettingPage extends SettingPage {
	private readonly app: App;
	private readonly onStorageChanged: () => void;
	private scopeFilter = ALL_FILTER_VALUE;
	private searchQuery = '';
	private readonly staleEntryAgeMs: number;

	constructor(app: App, staleEntryAgeMs: number, onStorageChanged: () => void) {
		super();
		this.app = app;
		this.onStorageChanged = onStorageChanged;
		this.staleEntryAgeMs = staleEntryAgeMs;
		this.title = 'Script storage';
	}

	display(): void {
		this.containerEl.empty();
		const entries = ScriptStorageManager.listAll(this.app);
		const filteredEntries = this.filterEntries(entries);

		this.renderScriptStorageActions(entries);
		this.renderScriptStorageFilters(entries);
		this.renderScriptStorageGroups(filteredEntries);
	}

	private clearOldScriptStorage(): void {
		const deletedCount = ScriptStorageManager.deleteOlderThanAll(this.app, Date.now() - this.staleEntryAgeMs);
		new Notice(`Cleared ${deletedCount} script storage ${deletedCount === 1 ? 'key' : 'keys'}.`);
		this.refreshSettings();
	}

	private clearAllScriptStorage(): void {
		const deletedCount = ScriptStorageManager.deleteAllKnown(this.app);
		new Notice(`Cleared ${deletedCount} script storage ${deletedCount === 1 ? 'key' : 'keys'}.`);
		this.refreshSettings();
	}

	private clearScriptStorageScope(scope: string | null): void {
		const deletedCount = new ScriptStorageManager(this.app, Date.now, scope).deleteAll();
		new Notice(`Cleared ${deletedCount} script storage ${deletedCount === 1 ? 'key' : 'keys'} from ${formatScope(scope)}.`);
		this.refreshSettings();
	}

	private deleteScriptStorageEntry(entry: ScriptStorageEntry): void {
		new ScriptStorageManager(this.app, Date.now, entry.scope).delete(entry.key);
		new Notice(`Deleted script storage key ${entry.key}.`);
		this.refreshSettings();
	}

	private renderScriptStorageActions(entries: ScriptStorageEntry[]): void {
		const group = new SettingGroup(this.containerEl);

		group.addSetting(setting =>
			void setting
				.setName('Clear script storage')
				.setDesc(`${formatCount(entries.length, 'indexed storage key')}.`)
				.addButton(button =>
					button.setButtonText('Clear older than 30 days').onClick(() => {
						this.clearOldScriptStorage();
					}),
				)
				.addButton(button =>
					button
						.setButtonText('Clear all')
						.setDestructive()
						.onClick(() => {
							this.clearAllScriptStorage();
						}),
				),
		);
	}

	private renderScriptStorageFilters(entries: ScriptStorageEntry[]): void {
		const group = new SettingGroup(this.containerEl);

		group.addSetting(setting => void setting
			.setName('Search')
			.setDesc('Filter by key or scope.')
			.addSearch(search =>
				search.setValue(this.searchQuery).onChange(value => {
					this.searchQuery = value;
					this.display();
				}),
			));

		group.addSetting(setting => void setting
			.setName('Filters')
			.addDropdown(dropdown =>
				dropdown
					.addOptions(this.getScopeFilterOptions(entries))
					.setValue(this.scopeFilter)
					.onChange(value => {
						this.scopeFilter = value;
						this.display();
					}),
			)
			.addButton(button =>
				button.setButtonText('Clear filters').onClick(() => {
					this.scopeFilter = ALL_FILTER_VALUE;
					this.searchQuery = '';
					this.display();
				}),
			));
	}

	private renderScriptStorageGroups(entries: ScriptStorageEntry[]): void {
		if (entries.length === 0) {
			const group = new SettingGroup(this.containerEl);
			group.addSetting(setting => void setting.setName('No indexed script storage keys match the current filters.'));
			return;
		}

		for (const [scope, scopeEntries] of groupEntriesByScope(entries)) {
			const group = new SettingGroup(this.containerEl).setHeading(formatScope(scope));
			group.addSetting(setting =>
				void setting
					.setName('Clear scope')
					.setDesc(`${formatCount(scopeEntries.length, 'key')} - ${formatBytes(sumEntryBytes(scopeEntries))}`)
					.addButton(button =>
						button
							.setButtonText('Clear scope')
							.setDestructive()
							.onClick(() => {
								this.clearScriptStorageScope(scope);
							}),
					),
			);

			for (const entry of visibleSettingItems(scopeEntries)) {
				group.addSetting(setting => void setting
					.setName(entry.key)
					.setDesc(`${formatBytes(entry.sizeBytes)} - ${formatDate(entry.updatedAt)}`)
					.addButton(button =>
						button.setButtonText('Delete').onClick(() => {
							this.deleteScriptStorageEntry(entry);
						}),
					));
			}

			renderHiddenSettingItemCount(group, scopeEntries.length - visibleSettingItems(scopeEntries).length, 'storage keys');
		}
	}

	private filterEntries(entries: ScriptStorageEntry[]): ScriptStorageEntry[] {
		const normalizedQuery = this.searchQuery.trim().toLowerCase();

		return entries.filter(entry => {
			if (this.scopeFilter !== ALL_FILTER_VALUE && scopeFilterValue(entry.scope) !== this.scopeFilter) {
				return false;
			}

			if (normalizedQuery === '') {
				return true;
			}

			return `${entry.key} ${formatScope(entry.scope)}`.toLowerCase().includes(normalizedQuery);
		});
	}

	private getScopeFilterOptions(entries: ScriptStorageEntry[]): Record<string, string> {
		const options: Record<string, string> = { [ALL_FILTER_VALUE]: 'All scopes' };

		for (const entry of entries) {
			options[scopeFilterValue(entry.scope)] = formatScope(entry.scope);
		}

		return options;
	}

	private refreshSettings(): void {
		this.onStorageChanged();
		this.display();
	}
}

function groupEntriesByScope(entries: ScriptStorageEntry[]): [string | null, ScriptStorageEntry[]][] {
	return groupBySorted(
		entries,
		entry => entry.scope,
		(left, right) => formatScope(left).localeCompare(formatScope(right)),
	);
}

function scopeFilterValue(scope: string | null): string {
	return scope === null ? 'global' : `scope:${scope}`;
}

function sumEntryBytes(entries: ScriptStorageEntry[]): number {
	return entries.reduce((total, entry) => total + entry.sizeBytes, 0);
}

function formatScope(scope: string | null): string {
	return scope === null ? 'global' : `scoped ${scope.slice(0, 12)}`;
}
