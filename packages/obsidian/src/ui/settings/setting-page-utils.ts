import type { SettingGroup } from 'obsidian';

export const ALL_FILTER_VALUE = '__all__';
export const DEFAULT_VISIBLE_SETTING_ITEMS = 20;

export function formatBytes(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`;
	}

	return `${(bytes / 1024).toFixed(1)} KB`;
}

export function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleString();
}

export function formatCount(count: number, singularLabel: string, pluralLabel: string = `${singularLabel}s`): string {
	return `${count} ${count === 1 ? singularLabel : pluralLabel}`;
}

export function groupBySorted<TItem, TKey>(items: TItem[], getKey: (item: TItem) => TKey, compareKeys: (left: TKey, right: TKey) => number): [TKey, TItem[]][] {
	const groupedItems = new Map<TKey, TItem[]>();

	for (const item of items) {
		const key = getKey(item);
		const group = groupedItems.get(key);

		if (group === undefined) {
			groupedItems.set(key, [item]);
		} else {
			group.push(item);
		}
	}

	return [...groupedItems.entries()].sort(([left], [right]) => compareKeys(left, right));
}

export function visibleSettingItems<TItem>(items: TItem[], limit: number = DEFAULT_VISIBLE_SETTING_ITEMS): TItem[] {
	return items.slice(0, limit);
}

export function renderHiddenSettingItemCount(group: SettingGroup, hiddenCount: number, itemLabel: string): void {
	if (hiddenCount <= 0) {
		return;
	}

	group.addSetting(setting => void setting.setName(`${hiddenCount} more ${itemLabel} ${hiddenCount === 1 ? 'is' : 'are'} hidden.`));
}
