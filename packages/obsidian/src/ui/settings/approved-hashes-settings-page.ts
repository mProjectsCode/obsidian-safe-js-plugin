import { Notice, SettingGroup, SettingPage } from 'obsidian';
import type { PermissionApproval } from 'packages/obsidian/src/permissions/approval-store';
import type { LocalStoragePermissionApprovalStore } from 'packages/obsidian/src/permissions/approval-store';
import {
	ALL_FILTER_VALUE,
	formatCount,
	formatDate,
	groupBySorted,
	renderHiddenSettingItemCount,
	visibleSettingItems,
} from 'packages/obsidian/src/ui/settings/setting-page-utils';

export class ApprovedHashesSettingPage extends SettingPage {
	private permissionFilter = ALL_FILTER_VALUE;
	private readonly approvalStore: LocalStoragePermissionApprovalStore;
	private readonly onStorageChanged: () => void;
	private searchQuery = '';
	private sourceFilter = ALL_FILTER_VALUE;
	private readonly staleEntryAgeMs: number;

	constructor(approvalStore: LocalStoragePermissionApprovalStore, staleEntryAgeMs: number, onStorageChanged: () => void) {
		super();
		this.approvalStore = approvalStore;
		this.onStorageChanged = onStorageChanged;
		this.staleEntryAgeMs = staleEntryAgeMs;
		this.title = 'Approved script hashes';
	}

	display(): void {
		this.containerEl.empty();
		const approvals = this.approvalStore.list();
		const filteredApprovals = this.filterApprovals(approvals);

		this.renderApprovalActions(approvals);
		this.renderApprovalFilters(approvals);
		this.renderApprovalGroups(filteredApprovals);
	}

	private clearOldApprovals(): void {
		const deletedCount = this.approvalStore.deleteOlderThan(Date.now() - this.staleEntryAgeMs);
		new Notice(`Cleared ${deletedCount} approved script ${deletedCount === 1 ? 'hash' : 'hashes'}.`);
		this.refreshSettings();
	}

	private clearAllApprovals(): void {
		const deletedCount = this.approvalStore.deleteAll();
		new Notice(`Cleared ${deletedCount} approved script ${deletedCount === 1 ? 'hash' : 'hashes'}.`);
		this.refreshSettings();
	}

	private revokeApproval(approval: PermissionApproval | undefined): void {
		if (approval === undefined) {
			return;
		}

		this.approvalStore.delete(approval);
		new Notice(`Revoked approval for script hash ${approval.codeHash}.`);
		this.refreshSettings();
	}

	private revokeApprovalGroup(approvals: PermissionApproval[], source: string): void {
		let deletedCount = 0;

		for (const approval of approvals) {
			if (this.approvalStore.delete(approval)) {
				deletedCount += 1;
			}
		}

		new Notice(`Revoked ${deletedCount} approved script ${deletedCount === 1 ? 'hash' : 'hashes'} for ${formatSource(source)}.`);
		this.refreshSettings();
	}

	private renderApprovalActions(approvals: PermissionApproval[]): void {
		const group = new SettingGroup(this.containerEl);

		group.addSetting(
			setting =>
				void setting
					.setName('Clear approved hashes')
					.setDesc(`${formatCount(approvals.length, 'stored approval hash', 'stored approval hashes')}.`)
					.addButton(button =>
						button.setButtonText('Clear older than 30 days').onClick(() => {
							this.clearOldApprovals();
						}),
					)
					.addButton(button =>
						button
							.setButtonText('Clear all')
							.setDestructive()
							.onClick(() => {
								this.clearAllApprovals();
							}),
					),
		);
	}

	private renderApprovalFilters(approvals: PermissionApproval[]): void {
		const group = new SettingGroup(this.containerEl);

		group.addSetting(
			setting =>
				void setting
					.setName('Search')
					.setDesc('Filter by hash, source, or permission.')
					.addSearch(search =>
						search.setValue(this.searchQuery).onChange(value => {
							this.searchQuery = value;
							this.display();
						}),
					),
		);

		group.addSetting(
			setting =>
				void setting
					.setName('Filters')
					.addDropdown(dropdown =>
						dropdown
							.addOptions(this.getPermissionFilterOptions(approvals))
							.setValue(this.permissionFilter)
							.onChange(value => {
								this.permissionFilter = value;
								this.display();
							}),
					)
					.addDropdown(dropdown =>
						dropdown
							.addOptions(this.getSourceFilterOptions(approvals))
							.setValue(this.sourceFilter)
							.onChange(value => {
								this.sourceFilter = value;
								this.display();
							}),
					)
					.addButton(button =>
						button.setButtonText('Clear filters').onClick(() => {
							this.permissionFilter = ALL_FILTER_VALUE;
							this.sourceFilter = ALL_FILTER_VALUE;
							this.searchQuery = '';
							this.display();
						}),
					),
		);
	}

	private renderApprovalGroups(approvals: PermissionApproval[]): void {
		if (approvals.length === 0) {
			const group = new SettingGroup(this.containerEl);
			group.addSetting(setting => void setting.setName('No approved script hashes match the current filters.'));
			return;
		}

		for (const [source, sourceApprovals] of groupApprovalsBySource(approvals)) {
			const group = new SettingGroup(this.containerEl).setHeading(formatSource(source));
			group.addSetting(
				setting =>
					void setting
						.setName('Revoke group')
						.setDesc(formatCount(sourceApprovals.length, 'approval hash'))
						.addButton(button =>
							button
								.setButtonText('Revoke group')
								.setDestructive()
								.onClick(() => {
									this.revokeApprovalGroup(sourceApprovals, source);
								}),
						),
			);

			for (const approval of visibleSettingItems(sourceApprovals)) {
				group.addSetting(
					setting =>
						void setting
							.setName(approval.codeHash)
							.setDesc(`${approval.permissions.join(', ')} - ${formatDate(approval.updatedAt)}`)
							.addButton(button =>
								button.setButtonText('Revoke').onClick(() => {
									this.revokeApproval(approval);
								}),
							),
				);
			}

			renderHiddenSettingItemCount(group, sourceApprovals.length - visibleSettingItems(sourceApprovals).length, 'approved hashes');
		}
	}

	private filterApprovals(approvals: PermissionApproval[]): PermissionApproval[] {
		const normalizedQuery = this.searchQuery.trim().toLowerCase();

		return approvals.filter(approval => {
			if (this.permissionFilter !== ALL_FILTER_VALUE && !approval.permissions.some(permission => permission === this.permissionFilter)) {
				return false;
			}

			if (this.sourceFilter !== ALL_FILTER_VALUE && sourceFilterValue(approval) !== this.sourceFilter) {
				return false;
			}

			if (normalizedQuery === '') {
				return true;
			}

			return approvalSearchText(approval).includes(normalizedQuery);
		});
	}

	private getPermissionFilterOptions(approvals: PermissionApproval[]): Record<string, string> {
		const options: Record<string, string> = { [ALL_FILTER_VALUE]: 'All permissions' };

		for (const permission of [...new Set(approvals.flatMap(approval => approval.permissions))].sort()) {
			options[permission] = permission;
		}

		return options;
	}

	private getSourceFilterOptions(approvals: PermissionApproval[]): Record<string, string> {
		const options: Record<string, string> = { [ALL_FILTER_VALUE]: 'All sources' };

		for (const approval of approvals) {
			options[sourceFilterValue(approval)] = formatSource(sourceFilterValue(approval));
		}

		return options;
	}

	private refreshSettings(): void {
		this.onStorageChanged();
		this.display();
	}
}

function approvalSearchText(approval: PermissionApproval): string {
	return `${approval.codeHash} ${formatSource(sourceFilterValue(approval))} ${approval.permissions.join(' ')}`.toLowerCase();
}

function groupApprovalsBySource(approvals: PermissionApproval[]): [string, PermissionApproval[]][] {
	return groupBySorted(
		approvals,
		approval => sourceFilterValue(approval),
		(left, right) => formatSource(left).localeCompare(formatSource(right)),
	);
}

function sourceFilterValue(approval: PermissionApproval): string {
	return approval.callerPluginId === undefined ? 'source:notes' : `plugin:${approval.callerPluginId}`;
}

function formatSource(source: string): string {
	return source === 'source:notes' ? 'notes' : source.slice('plugin:'.length);
}
