import { MarkdownString, TreeItem, TreeItemCollapsibleState, window } from 'vscode';
import { getPresenceDataUri } from '../../avatars';
import { GlyphChars } from '../../constants';
import { GitUri } from '../../git/gitUri';
import { GitContributor, GitLog } from '../../git/models';
import { gate } from '../../system/decorators/gate';
import { debug } from '../../system/decorators/log';
import { map } from '../../system/iterable';
import { pluralize } from '../../system/string';
import { ContactPresence } from '../../vsls/vsls';
import { ContributorsView } from '../contributorsView';
import { RepositoriesView } from '../repositoriesView';
import { CommitNode } from './commitNode';
import { LoadMoreNode, MessageNode } from './common';
import { insertDateMarkers } from './helpers';
import { RepositoryNode } from './repositoryNode';
import { ContextValues, PageableViewNode, ViewNode } from './viewNode';

export class ContributorNode extends ViewNode<ContributorsView | RepositoriesView> implements PageableViewNode {
	static key = ':contributor';
	static getId(
		repoPath: string,
		name: string | undefined,
		email: string | undefined,
		username: string | undefined,
	): string {
		return `${RepositoryNode.getId(repoPath)}${this.key}(${name}|${email}|${username})`;
	}

	constructor(
		uri: GitUri,
		view: ContributorsView | RepositoriesView,
		parent: ViewNode,
		public readonly contributor: GitContributor,
		private readonly _options?: {
			all?: boolean;
			ref?: string;
			presence: Map<string, ContactPresence> | undefined;
		},
	) {
		super(uri, view, parent);
	}

	override toClipboard(): string {
		return `${this.contributor.name}${this.contributor.email ? ` <${this.contributor.email}>` : ''}`;
	}

	override get id(): string {
		return ContributorNode.getId(
			this.contributor.repoPath,
			this.contributor.name,
			this.contributor.email,
			this.contributor.username,
		);
	}

	async getChildren(): Promise<ViewNode[]> {
		const log = await this.getLog();
		if (log == null) return [new MessageNode(this.view, this, '未找到提交。')];

		const getBranchAndTagTips = await this.view.container.git.getBranchesAndTagsTipsFn(this.uri.repoPath);
		const children = [
			...insertDateMarkers(
				map(
					log.commits.values(),
					c => new CommitNode(this.view, this, c, undefined, undefined, getBranchAndTagTips),
				),
				this,
			),
		];

		if (log.hasMore) {
			children.push(new LoadMoreNode(this.view, this, children[children.length - 1]));
		}
		return children;
	}

	async getTreeItem(): Promise<TreeItem> {
		const presence = this._options?.presence?.get(this.contributor.email!);

		const item = new TreeItem(
			this.contributor.current ? `${this.contributor.label}（你）` : this.contributor.label,
			TreeItemCollapsibleState.Collapsed,
		);
		item.id = this.id;
		item.contextValue = this.contributor.current
			? `${ContextValues.Contributor}+current`
			: ContextValues.Contributor;
		item.description = `${
			presence != null && presence.status !== 'offline'
				? `${presence.statusText} ${GlyphChars.Space}${GlyphChars.Dot}${GlyphChars.Space} `
				: ''
		}${this.contributor.date != null ? `${this.contributor.formatDateFromNow()}，` : ''}${pluralize(
			'次提交',
			this.contributor.count,
			{ plural: '次提交' },
		)}`;

		let avatarUri;
		let avatarMarkdown;
		if (this.view.config.avatars) {
			const size = this.view.container.config.hovers.avatarSize;
			avatarUri = await this.contributor.getAvatarUri({
				defaultStyle: this.view.container.config.defaultGravatarsStyle,
				size: size,
			});

			if (presence != null) {
				const title = `${
					this.contributor.current ? '你的状态' : `${this.contributor.label} 的状态`
				}：${presence.statusText}`;

				avatarMarkdown = `![${title}](${avatarUri.toString(
					true,
				)}|width=${size},height=${size} "${title}")![${title}](${getPresenceDataUri(
					presence.status,
				)} "${title}")`;
			} else {
				avatarMarkdown = `![${this.contributor.label}](${avatarUri.toString(
					true,
				)}|width=${size},height=${size} "${this.contributor.label}")`;
			}
		}

		const numberFormatter = new Intl.NumberFormat();

		const stats =
			this.contributor.stats != null
				? `\\\n${pluralize('个文件', this.contributor.stats.files, {
						format: numberFormatter.format,
						plural: '个文件',
				  })}已更改，${pluralize('处新增', this.contributor.stats.additions, {
						format: numberFormatter.format,
						plural: '处新增',
				  })}，${pluralize('处删除', this.contributor.stats.deletions, {
						format: numberFormatter.format,
						plural: '处删除',
				  })}`
				: '';

		const link = this.contributor.email
			? `__[${this.contributor.name}](mailto:${this.contributor.email} "给 ${this.contributor.label} 发邮件 (${this.contributor.email})")__`
			: `__${this.contributor.label}__`;

		const lastCommitted =
			this.contributor.date != null
				? `最近一次提交于 ${this.contributor.formatDateFromNow()} (${this.contributor.formatDate()})\\\n`
				: '';

		const markdown = new MarkdownString(
			`${avatarMarkdown != null ? avatarMarkdown : ''} &nbsp;${link} \n\n${lastCommitted}${pluralize(
				'次提交',
				this.contributor.count,
				{ format: numberFormatter.format, plural: '次提交' },
			)}${stats}`,
		);
		markdown.supportHtml = true;
		markdown.isTrusted = true;

		item.tooltip = markdown;
		item.iconPath = avatarUri;

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
		if (this._log == null) {
			this._log = await this.view.container.git.getLog(this.uri.repoPath!, {
				all: this._options?.all,
				ref: this._options?.ref,
				limit: this.limit ?? this.view.config.defaultItemLimit,
				authors: [
					{
						name: this.contributor.name,
						email: this.contributor.email,
						username: this.contributor.username,
						id: this.contributor.id,
					},
				],
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
