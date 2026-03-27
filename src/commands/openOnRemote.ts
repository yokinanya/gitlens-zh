import { Commands, GlyphChars } from '../constants';
import type { Container } from '../container';
import { GitRemote, GitRevision } from '../git/models';
import { RemoteProvider, RemoteResource, RemoteResourceType } from '../git/remotes/provider';
import { Logger } from '../logger';
import { Messages } from '../messages';
import { RemoteProviderPicker } from '../quickpicks/remoteProviderPicker';
import { command } from '../system/command';
import { pad, splitSingle } from '../system/string';
import { Command } from './base';

export type OpenOnRemoteCommandArgs =
	| {
			resource: RemoteResource;
			repoPath: string;

			remote?: string;
			clipboard?: boolean;
	  }
	| {
			resource: RemoteResource;
			remotes: GitRemote<RemoteProvider>[];

			remote?: string;
			clipboard?: boolean;
	  };

@command()
export class OpenOnRemoteCommand extends Command {
	constructor(private readonly container: Container) {
		super([Commands.OpenOnRemote, Commands.Deprecated_OpenInRemote]);
	}

	async execute(args?: OpenOnRemoteCommandArgs) {
		if (args?.resource == null) return;

		let remotes =
			'remotes' in args ? args.remotes : await this.container.git.getRemotesWithProviders(args.repoPath);

		if (args.remote != null) {
			const filtered = remotes.filter(r => r.name === args.remote);
			// Only filter if we get some results
			if (remotes.length > 0) {
				remotes = filtered;
			}
		}

		try {
			if (args.resource.type === RemoteResourceType.Branch) {
				// Check to see if the remote is in the branch
				const [remoteName, branchName] = splitSingle(args.resource.branch, '/');
				if (branchName != null) {
					const remote = remotes.find(r => r.name === remoteName);
					if (remote != null) {
						args.resource.branch = branchName;
						remotes = [remote];
					}
				}
			} else if (args.resource.type === RemoteResourceType.Revision) {
				const { commit, fileName } = args.resource;
				if (commit != null) {
					const file = await commit.findFile(fileName);
					if (file?.status === 'D') {
						// Resolve to the previous commit to that file
						args.resource.sha = await this.container.git.resolveReference(
							commit.repoPath,
							`${commit.sha}^`,
							fileName,
						);
					} else {
						args.resource.sha = commit.sha;
					}
				}
			}

			const providers = GitRemote.getHighlanderProviders(remotes);
			const provider = providers?.length ? providers[0].name : '远程';

			const options: Parameters<typeof RemoteProviderPicker.show>[4] = {
				autoPick: 'default',
				clipboard: args.clipboard,
				setDefault: true,
			};
			let title;
			let placeHolder = `选择要${args.clipboard ? '复制 URL' : '打开'}的远程`;

			switch (args.resource.type) {
				case RemoteResourceType.Branch:
					title = `${args.clipboard ? `复制 ${provider} 分支 URL` : `在 ${provider} 上打开分支`}${pad(
						GlyphChars.Dot,
						2,
						2,
					)}${args.resource.branch}`;
					break;

				case RemoteResourceType.Branches:
					title = `${args.clipboard ? `复制 ${provider} 分支 URL` : `在 ${provider} 上打开分支`}`;
					break;

				case RemoteResourceType.Commit:
					title = `${args.clipboard ? `复制 ${provider} 提交 URL` : `在 ${provider} 上打开提交`}${pad(
						GlyphChars.Dot,
						2,
						2,
					)}${GitRevision.shorten(args.resource.sha)}`;
					break;

				case RemoteResourceType.Comparison:
					title = `${
						args.clipboard ? `复制 ${provider} 比较 URL` : `在 ${provider} 上打开比较`
					}${pad(GlyphChars.Dot, 2, 2)}${GitRevision.createRange(
						args.resource.base,
						args.resource.compare,
						args.resource.notation ?? '...',
					)}`;
					break;

				case RemoteResourceType.CreatePullRequest:
					options.autoPick = true;
					options.setDefault = false;

					title = `${
						args.clipboard
							? `复制 ${provider} 创建拉取请求 URL`
							: `在 ${provider} 上创建拉取请求`
					}${pad(GlyphChars.Dot, 2, 2)}${
						args.resource.base?.branch
							? GitRevision.createRange(args.resource.base.branch, args.resource.compare.branch, '...')
							: args.resource.compare.branch
					}`;

					placeHolder = `选择要${args.clipboard ? '复制创建拉取请求 URL' : '创建拉取请求'}的远程`;
					break;

				case RemoteResourceType.File:
					title = `${args.clipboard ? `复制 ${provider} 文件 URL` : `在 ${provider} 上打开文件`}${pad(
						GlyphChars.Dot,
						2,
						2,
					)}${args.resource.fileName}`;
					break;

				case RemoteResourceType.Repo:
					title = `${args.clipboard ? `复制 ${provider} 仓库 URL` : `在 ${provider} 上打开仓库`}`;
					break;

				case RemoteResourceType.Revision: {
					title = `${args.clipboard ? `复制 ${provider} 文件 URL` : `在 ${provider} 上打开文件`}${pad(
						GlyphChars.Dot,
						2,
						2,
					)}${GitRevision.shorten(args.resource.sha)}${pad(GlyphChars.Dot, 1, 1)}${args.resource.fileName}`;
					break;
				}
			}

			const pick = await RemoteProviderPicker.show(title, placeHolder, args.resource, remotes, options);
			void (await pick?.execute());
		} catch (ex) {
			Logger.error(ex, 'OpenOnRemoteCommand');
			void Messages.showGenericErrorMessage('无法在远程提供方中打开');
		}
	}
}
