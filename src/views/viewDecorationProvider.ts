import {
	CancellationToken,
	Disposable,
	Event,
	EventEmitter,
	FileDecoration,
	FileDecorationProvider,
	ThemeColor,
	Uri,
	window,
} from 'vscode';
import { GlyphChars } from '../constants';
import { GitBranchStatus } from '../git/models';

export class ViewFileDecorationProvider implements FileDecorationProvider, Disposable {
	private readonly _onDidChange = new EventEmitter<undefined | Uri | Uri[]>();
	get onDidChange(): Event<undefined | Uri | Uri[]> {
		return this._onDidChange.event;
	}

	private readonly disposable: Disposable;
	constructor() {
		this.disposable = Disposable.from(
			// Register the current branch decorator separately (since we can only have 2 char's per decoration)
			window.registerFileDecorationProvider({
				provideFileDecoration: (uri, token) => {
					if (uri.scheme !== 'gitlens-view') return undefined;

					if (uri.authority === 'branch') {
						return this.provideBranchCurrentDecoration(uri, token);
					}

					if (uri.authority === 'remote') {
						return this.provideRemoteDefaultDecoration(uri, token);
					}

					return undefined;
				},
			}),
			window.registerFileDecorationProvider(this),
		);
	}

	dispose(): void {
		this.disposable.dispose();
	}

	provideFileDecoration(uri: Uri, token: CancellationToken): FileDecoration | undefined {
		if (uri.scheme !== 'gitlens-view') return undefined;

		switch (uri.authority) {
			case 'branch':
				return this.provideBranchStatusDecoration(uri, token);
			case 'commit-file':
				return this.provideCommitFileStatusDecoration(uri, token);
		}

		return undefined;
	}

	provideCommitFileStatusDecoration(uri: Uri, _token: CancellationToken): FileDecoration | undefined {
		const [, , status] = uri.path.split('/');

		switch (status) {
			case '!':
				return {
					badge: 'I',
					color: new ThemeColor('gitlens.decorations.ignoredForegroundColor'),
					tooltip: '已忽略',
				};
			case '?':
				return {
					badge: 'U',
					color: new ThemeColor('gitlens.decorations.untrackedForegroundColor'),
					tooltip: '未跟踪',
				};
			case 'A':
				return {
					badge: 'A',
					color: new ThemeColor('gitlens.decorations.addedForegroundColor'),
					tooltip: '已添加',
				};
			case 'C':
				return {
					badge: 'C',
					color: new ThemeColor('gitlens.decorations.copiedForegroundColor'),
					tooltip: '已复制',
				};
			case 'D':
				return {
					badge: 'D',
					color: new ThemeColor('gitlens.decorations.deletedForegroundColor'),
					tooltip: '已删除',
				};
			case 'M':
				return {
					badge: 'M',
					// color: new ThemeColor('gitlens.decorations.modifiedForegroundColor'),
					tooltip: '已修改',
				};
			case 'R':
				return {
					badge: 'R',
					color: new ThemeColor('gitlens.decorations.renamedForegroundColor'),
					tooltip: '已重命名',
				};
			default:
				return undefined;
		}
	}

	provideBranchStatusDecoration(uri: Uri, _token: CancellationToken): FileDecoration | undefined {
		const [, , status] = uri.path.split('/');

		switch (status as GitBranchStatus) {
			case GitBranchStatus.Ahead:
				return {
					badge: '▲',
					color: new ThemeColor('gitlens.decorations.branchAheadForegroundColor'),
					tooltip: '领先',
				};
			case GitBranchStatus.Behind:
				return {
					badge: '▼',
					color: new ThemeColor('gitlens.decorations.branchBehindForegroundColor'),
					tooltip: '落后',
				};
			case GitBranchStatus.Diverged:
				return {
					badge: '▼▲',
					color: new ThemeColor('gitlens.decorations.branchDivergedForegroundColor'),
					tooltip: '已分叉',
				};
			case GitBranchStatus.MissingUpstream:
				return {
					badge: '!',
					color: new ThemeColor('gitlens.decorations.branchMissingUpstreamForegroundColor'),
					tooltip: '缺少上游',
				};
			case GitBranchStatus.UpToDate:
				return {
					badge: '',
					color: new ThemeColor('gitlens.decorations.branchUpToDateForegroundColor'),
					tooltip: '已是最新',
				};
			case GitBranchStatus.Unpublished:
				return {
					badge: '▲+',
					color: new ThemeColor('gitlens.decorations.branchUnpublishedForegroundColor'),
					tooltip: '未发布',
				};
			default:
				return undefined;
		}
	}

	provideBranchCurrentDecoration(uri: Uri, _token: CancellationToken): FileDecoration | undefined {
		const [, , status, current] = uri.path.split('/');

		if (!current) return undefined;

		let color;
		switch (status as GitBranchStatus) {
			case GitBranchStatus.Ahead:
				color = new ThemeColor('gitlens.decorations.branchAheadForegroundColor');
				break;
			case GitBranchStatus.Behind:
				color = new ThemeColor('gitlens.decorations.branchBehindForegroundColor');
				break;
			case GitBranchStatus.Diverged:
				color = new ThemeColor('gitlens.decorations.branchDivergedForegroundColor');
				break;
			case GitBranchStatus.UpToDate:
				color = new ThemeColor('gitlens.decorations.branchUpToDateForegroundColor');
				break;
			case GitBranchStatus.Unpublished:
				color = new ThemeColor('gitlens.decorations.branchUnpublishedForegroundColor');
				break;
		}

		return {
			badge: GlyphChars.Check,
			color: color,
			tooltip: '当前分支',
		};
	}

	provideRemoteDefaultDecoration(uri: Uri, _token: CancellationToken): FileDecoration | undefined {
		const [, isDefault] = uri.path.split('/');

		if (!isDefault) return undefined;

		return {
			badge: GlyphChars.Check,
			tooltip: '默认远程',
		};
	}
}
