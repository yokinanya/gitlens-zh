import { env, TextEditor, Uri, window } from 'vscode';
import { Commands } from '../constants';
import type { Container } from '../container';
import { GitUri } from '../git/gitUri';
import { Logger } from '../logger';
import { RepositoryPicker } from '../quickpicks/repositoryPicker';
import { command } from '../system/command';
import { ActiveEditorCommand, getCommandUri } from './base';

@command()
export class CopyCurrentBranchCommand extends ActiveEditorCommand {
	constructor(private readonly container: Container) {
		super(Commands.CopyCurrentBranch);
	}

	async execute(editor?: TextEditor, uri?: Uri) {
		uri = getCommandUri(uri, editor);

		const gitUri = uri != null ? await GitUri.fromUri(uri) : undefined;

		const repository = await RepositoryPicker.getBestRepositoryOrShow(gitUri, editor, '复制当前分支名称');
		if (repository == null) return;

		try {
			const branch = await repository.getBranch();
			if (branch?.name) {
				await env.clipboard.writeText(branch.name);
			}
		} catch (ex) {
			Logger.error(ex, 'CopyCurrentBranchCommand');
			void window.showErrorMessage('无法复制当前分支名称。更多细节请查看输出频道');
		}
	}
}
