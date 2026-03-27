import { QuickInput, QuickInputButton, ThemeIcon, Uri } from 'vscode';
import { Container } from '../container';

export class ToggleQuickInputButton implements QuickInputButton {
	constructor(
		private readonly state:
			| {
					on: { icon: string | { light: Uri; dark: Uri } | ThemeIcon; tooltip: string };
					off: { icon: string | { light: Uri; dark: Uri } | ThemeIcon; tooltip: string };
			  }
			| (() => {
					on: { icon: string | { light: Uri; dark: Uri } | ThemeIcon; tooltip: string };
					off: { icon: string | { light: Uri; dark: Uri } | ThemeIcon; tooltip: string };
			  }),
		private _on = false,
	) {}

	get iconPath(): { light: Uri; dark: Uri } | ThemeIcon {
		const icon = this.getToggledState().icon;
		return typeof icon === 'string'
			? {
					dark: Uri.file(Container.instance.context.asAbsolutePath(`images/dark/${icon}.svg`)),
					light: Uri.file(Container.instance.context.asAbsolutePath(`images/light/${icon}.svg`)),
			  }
			: icon;
	}

	get tooltip(): string {
		return this.getToggledState().tooltip;
	}

	get on() {
		return this._on;
	}
	set on(value: boolean) {
		this._on = value;
	}

	/**
	 * @returns `true` if the step should be retried (refreshed)
	 */
	onDidClick?(quickInput: QuickInput): boolean | void | Promise<boolean | void>;

	private getState() {
		return typeof this.state === 'function' ? this.state() : this.state;
	}

	private getToggledState() {
		return this.on ? this.getState().on : this.getState().off;
	}
}

export class SelectableQuickInputButton extends ToggleQuickInputButton {
	constructor(tooltip: string, icon: { off: string | ThemeIcon; on: string | ThemeIcon }, selected: boolean = false) {
		super({ off: { tooltip: tooltip, icon: icon.off }, on: { tooltip: tooltip, icon: icon.on } }, selected);
	}
}

export namespace QuickCommandButtons {
	export const Fetch: QuickInputButton = {
		iconPath: new ThemeIcon('sync'),
		tooltip: '抓取',
	};

	export const LoadMore: QuickInputButton = {
		iconPath: new ThemeIcon('refresh'),
		tooltip: '加载更多',
	};

	export const MatchCaseToggle = class extends SelectableQuickInputButton {
		constructor(on = false) {
			super('区分大小写', { off: 'icon-match-case', on: 'icon-match-case-selected' }, on);
		}
	};

	export const MatchAllToggle = class extends SelectableQuickInputButton {
		constructor(on = false) {
			super('全部匹配', { off: 'icon-match-all', on: 'icon-match-all-selected' }, on);
		}
	};

	export const MatchRegexToggle = class extends SelectableQuickInputButton {
		constructor(on = false) {
			super('使用正则表达式匹配', { off: 'icon-match-regex', on: 'icon-match-regex-selected' }, on);
		}
	};

	export const PickCommit: QuickInputButton = {
		iconPath: new ThemeIcon('git-commit'),
		tooltip: '选择指定提交',
	};

	export const PickCommitToggle = class extends ToggleQuickInputButton {
		constructor(on = false, context: { showTags: boolean }, onDidClick?: (quickInput: QuickInput) => void) {
			super(
				() => ({
					on: { tooltip: '选择指定提交', icon: new ThemeIcon('git-commit') },
					off: {
						tooltip: `选择分支${context.showTags ? '或标签' : ''}`,
						icon: new ThemeIcon('git-branch'),
					},
				}),
				on,
			);

			this.onDidClick = onDidClick;
		}
	};

	export const OpenInNewWindow: QuickInputButton = {
		iconPath: new ThemeIcon('empty-window'),
		tooltip: '在新窗口中打开',
	};

	export const RevealInSideBar: QuickInputButton = {
		iconPath: new ThemeIcon('eye'),
		tooltip: '在侧边栏中定位',
	};

	export const SearchInSideBar: QuickInputButton = {
		iconPath: new ThemeIcon('search'),
		tooltip: '在侧边栏中搜索',
	};

	export const ShowResultsInSideBar: QuickInputButton = {
		iconPath: new ThemeIcon('link-external'),
		tooltip: '在侧边栏中显示结果',
	};

	export const ShowTagsToggle = class extends SelectableQuickInputButton {
		constructor(on = false) {
			super('显示标签', { off: new ThemeIcon('tag'), on: 'icon-tag-selected' }, on);
		}
	};

	export const WillConfirmForced: QuickInputButton = {
		iconPath: new ThemeIcon('check'),
		tooltip: '始终确认',
	};

	export const WillConfirmToggle = class extends ToggleQuickInputButton {
		constructor(on = false, onDidClick?: (quickInput: QuickInput) => void) {
			super(
				() => ({
					on: {
						tooltip: '需要确认',
						icon: {
							dark: Uri.file(Container.instance.context.asAbsolutePath('images/dark/icon-check.svg')),
							light: Uri.file(Container.instance.context.asAbsolutePath('images/light/icon-check.svg')),
						},
					},
					off: {
						tooltip: '跳过确认',
						icon: {
							dark: Uri.file(Container.instance.context.asAbsolutePath('images/dark/icon-no-check.svg')),
							light: Uri.file(
								Container.instance.context.asAbsolutePath('images/light/icon-no-check.svg'),
							),
						},
					},
				}),
				on,
			);

			this.onDidClick = onDidClick;
		}
	};
}
