import { TextEditor, Uri, window } from 'vscode';
import { Commands } from '../constants';
import type { Container } from '../container';
import { GitUri } from '../git/gitUri';
import { RemoteResourceType } from '../git/remotes/provider';
import { Logger } from '../logger';
import { RepositoryPicker } from '../quickpicks/repositoryPicker';
import { command, executeCommand } from '../system/command';
import { ActiveEditorCommand, CommandContext, getCommandUri, isCommandContextViewNodeHasRemote } from './base';
import { OpenOnRemoteCommandArgs } from './openOnRemote';

export interface OpenRepoOnRemoteCommandArgs {
	clipboard?: boolean;
	remote?: string;
}

@command()
export class OpenRepoOnRemoteCommand extends ActiveEditorCommand {
	constructor(private readonly container: Container) {
		super([Commands.OpenRepoOnRemote, Commands.Deprecated_OpenRepoInRemote, Commands.CopyRemoteRepositoryUrl]);
	}

	protected override preExecute(context: CommandContext, args?: OpenRepoOnRemoteCommandArgs) {
		if (isCommandContextViewNodeHasRemote(context)) {
			args = { ...args, remote: context.node.remote.name };
		}

		if (context.command === Commands.CopyRemoteRepositoryUrl) {
			args = { ...args, clipboard: true };
		}

		return this.execute(context.editor, context.uri, args);
	}

	async execute(editor?: TextEditor, uri?: Uri, args?: OpenRepoOnRemoteCommandArgs) {
		uri = getCommandUri(uri, editor);

		const gitUri = uri != null ? await GitUri.fromUri(uri) : undefined;

		const repoPath = (
			await RepositoryPicker.getBestRepositoryOrShow(
				gitUri,
				editor,
				args?.clipboard ? '选择要复制 URL 的仓库' : '选择要在远程上打开的仓库',
			)
		)?.path;
		if (!repoPath) return;

		try {
			void (await executeCommand<OpenOnRemoteCommandArgs>(Commands.OpenOnRemote, {
				resource: {
					type: RemoteResourceType.Repo,
				},
				repoPath: repoPath,
				remote: args?.remote,
				clipboard: args?.clipboard,
			}));
		} catch (ex) {
			Logger.error(ex, 'OpenRepoOnRemoteCommand');
			void window.showErrorMessage('无法在远程提供方中打开仓库。更多细节请查看输出频道');
		}
	}
}
