import { MarkdownString, ThemeColor, ThemeIcon, TreeItem, TreeItemCollapsibleState, window } from 'vscode';
import { Colors } from '../../constants';
import { GitUri } from '../../git/gitUri';
import { GitBranch, GitLog, GitRemote, GitRevision, GitTrackingState } from '../../git/models';
import { fromNow } from '../../system/date';
import { gate } from '../../system/decorators/gate';
import { debug } from '../../system/decorators/log';
import { first, map } from '../../system/iterable';
import { ViewsWithCommits } from '../viewBase';
import { BranchNode } from './branchNode';
import { BranchTrackingStatusFilesNode } from './branchTrackingStatusFilesNode';
import { CommitNode } from './commitNode';
import { LoadMoreNode } from './common';
import { insertDateMarkers } from './helpers';
import { ContextValues, PageableViewNode, ViewNode } from './viewNode';

export interface BranchTrackingStatus {
	ref: string;
	repoPath: string;
	state: GitTrackingState;
	upstream?: string;
}

export class BranchTrackingStatusNode extends ViewNode<ViewsWithCommits> implements PageableViewNode {
	static key = ':status-branch:upstream';
	static getId(
		repoPath: string,
		name: string,
		root: boolean,
		upstream: string | undefined,
		upstreamType: string,
	): string {
		return `${BranchNode.getId(repoPath, name, root)}${this.key}(${upstream ?? ''}):${upstreamType}`;
	}

	private readonly options: {
		showAheadCommits?: boolean;
	};

	constructor(
		view: ViewsWithCommits,
		parent: ViewNode,
		public readonly branch: GitBranch,
		public readonly status: BranchTrackingStatus,
		public readonly upstreamType: 'ahead' | 'behind' | 'same' | 'none',
		// Specifies that the node is shown as a root
		public readonly root: boolean = false,
		options?: {
			showAheadCommits?: boolean;
		},
	) {
		super(GitUri.fromRepoPath(status.repoPath), view, parent);

		this.options = { showAheadCommits: false, ...options };
	}

	override get id(): string {
		return BranchTrackingStatusNode.getId(
			this.status.repoPath,
			this.status.ref,
			this.root,
			this.status.upstream,
			this.upstreamType,
		);
	}

	get repoPath(): string {
		return this.uri.repoPath!;
	}

	async getChildren(): Promise<ViewNode[]> {
		if (this.upstreamType === 'same' || this.upstreamType === 'none') return [];

		const log = await this.getLog();
		if (log == null) return [];

		let commits;
		if (this.upstreamType === 'ahead') {
			// Since the last commit when we are looking 'ahead' can have no previous (because of the range given) -- look it up
			commits = [...log.commits.values()];
			const commit = commits[commits.length - 1];
			const previousSha = await commit.getPreviousSha();
			if (previousSha == null) {
				const previousLog = await this.view.container.git.getLog(this.uri.repoPath!, {
					limit: 2,
					ref: commit.sha,
				});
				if (previousLog != null) {
					commits[commits.length - 1] = first(previousLog.commits.values());
				}
			}
		} else {
			commits = log.commits.values();
		}

		const children = [];

		let showFiles = true;
		if (
			!this.options.showAheadCommits &&
			this.upstreamType === 'ahead' &&
			this.status.upstream &&
			this.status.state.ahead > 0
		) {
			showFiles = false;
			// TODO@eamodio fix this
			children.push(
				...(await new BranchTrackingStatusFilesNode(
					this.view,
					this,
					this.branch,
					this.status as Required<BranchTrackingStatus>,
					this.upstreamType,
					this.root,
				).getChildren()),
			);
		} else {
			children.push(
				...insertDateMarkers(
					map(commits, c => new CommitNode(this.view, this, c, this.upstreamType === 'ahead', this.branch)),
					this,
					1,
				),
			);

			if (log.hasMore) {
				children.push(new LoadMoreNode(this.view, this, children[children.length - 1]));
			}
		}

		if (showFiles) {
			children.splice(
				0,
				0,
				new BranchTrackingStatusFilesNode(
					this.view,
					this,
					this.branch,
					this.status as Required<BranchTrackingStatus>,
					this.upstreamType,
					this.root,
				),
			);
		}

		return children;
	}

	async getTreeItem(): Promise<TreeItem> {
		let lastFetched = 0;

		if (this.upstreamType !== 'none') {
			const repo = this.view.container.git.getRepository(this.repoPath);
			lastFetched = (await repo?.getLastFetched()) ?? 0;
		}

		let label;
		let description;
		let collapsibleState;
		let contextValue;
		let icon;
		let tooltip;
		switch (this.upstreamType) {
			case 'ahead': {
				const remote = await this.branch.getRemote();

				label = `待推送到 ${remote?.name ?? GitBranch.getRemote(this.status.upstream!)}${
					remote?.provider?.name ? `（${remote?.provider.name}）` : ''
				}`;
				description = `${this.status.state.ahead} 次提交`;
				tooltip = `分支 $(git-branch) ${this.branch.name} 比 $(git-branch) ${this.status.upstream}${
					remote?.provider?.name ? `（${remote.provider.name}）` : ''
				} 领先 $(arrow-up) ${this.status.state.ahead} 次提交`;

				collapsibleState = TreeItemCollapsibleState.Collapsed;
				contextValue = this.root
					? ContextValues.StatusAheadOfUpstream
					: ContextValues.BranchStatusAheadOfUpstream;
				icon = new ThemeIcon('cloud-upload', new ThemeColor(Colors.UnpublishedChangesIconColor));

				break;
			}
			case 'behind': {
				const remote = await this.branch.getRemote();

				label = `待从 ${remote?.name ?? GitBranch.getRemote(this.status.upstream!)} 拉取的更改${
					remote?.provider?.name ? `（${remote.provider.name}）` : ''
				}`;
				description = `${this.status.state.behind} 次提交`;
				tooltip = `分支 $(git-branch) ${this.branch.name} 比 $(git-branch) ${this.status.upstream}${
					remote?.provider?.name ? `（${remote.provider.name}）` : ''
				} 落后 $(arrow-down) ${this.status.state.behind} 次提交`;

				collapsibleState = TreeItemCollapsibleState.Collapsed;
				contextValue = this.root
					? ContextValues.StatusBehindUpstream
					: ContextValues.BranchStatusBehindUpstream;
				icon = new ThemeIcon('cloud-download', new ThemeColor(Colors.UnpulledChangesIconColor));

				break;
			}
			case 'same': {
				const remote = await this.branch.getRemote();

				label = `与 ${remote?.name ?? GitBranch.getRemote(this.status.upstream!)} 保持同步${
					remote?.provider?.name ? `（${remote.provider.name}）` : ''
				}`;
				description = lastFetched ? `上次抓取 ${fromNow(new Date(lastFetched))}` : '';
				tooltip = `分支 $(git-branch) ${this.branch.name} 与 $(git-branch) ${this.status.upstream} 保持同步${
					remote?.provider?.name ? `（${remote.provider.name}）` : ''
				}`;

				collapsibleState = TreeItemCollapsibleState.None;
				contextValue = this.root
					? ContextValues.StatusSameAsUpstream
					: ContextValues.BranchStatusSameAsUpstream;
				icon = new ThemeIcon('cloud');

				break;
			}
			case 'none': {
				const remotes = await this.view.container.git.getRemotesWithProviders(this.branch.repoPath);
				const providers = GitRemote.getHighlanderProviders(remotes);
				const providerName = providers?.length ? providers[0].name : undefined;

				label = `将 ${this.branch.name} 发布到 ${providerName ?? '远程仓库'}`;
				tooltip = `分支 $(git-branch) ${this.branch.name} 尚未发布到 ${providerName ?? '远程仓库'}`;

				collapsibleState = TreeItemCollapsibleState.None;
				contextValue = this.root ? ContextValues.StatusNoUpstream : ContextValues.BranchStatusNoUpstream;
				icon = new ThemeIcon(
					'cloud-upload',
					remotes.length ? new ThemeColor(Colors.UnpublishedChangesIconColor) : undefined,
				);

				break;
			}
		}

		const item = new TreeItem(label, collapsibleState);
		item.id = this.id;
		item.contextValue = contextValue;
		item.description = description;
		if (lastFetched) {
			tooltip += `\n\n上次抓取 ${fromNow(new Date(lastFetched))}`;
		}
		item.iconPath = icon;

		const markdown = new MarkdownString(tooltip, true);
		markdown.supportHtml = true;
		markdown.isTrusted = true;

		item.tooltip = markdown;

		return item;
	}

	@gate()
	@debug()
	override refresh(reset?: boolean) {
		if (reset) {
			this._log = undefined;
		}
	}

	private _log: GitLog | undefined;
	private async getLog() {
		if (this.upstreamType === 'same' || this.upstreamType === 'none') return undefined;

		if (this._log == null) {
			const range =
				this.upstreamType === 'ahead'
					? GitRevision.createRange(this.status.upstream, this.status.ref)
					: GitRevision.createRange(this.status.ref, this.status.upstream);

			this._log = await this.view.container.git.getLog(this.uri.repoPath!, {
				limit: this.limit ?? this.view.config.defaultItemLimit,
				ref: range,
			});
		}

		return this._log;
	}

	get hasMore() {
		return this._log?.hasMore ?? true;
	}

	limit: number | undefined = this.view.getNodeLastKnownLimit(this);
	@gate()
	async loadMore(limit?: number | { until?: any }) {
		let log = await window.withProgress(
			{
				location: { viewId: this.view.id },
			},
			() => this.getLog(),
		);
		if (log == null || !log.hasMore) return;

		log = await log.more?.(limit ?? this.view.config.pageItemLimit);
		if (this._log === log) return;

		this._log = log;
		this.limit = log?.count;

		void this.triggerChange(false);
	}
}
