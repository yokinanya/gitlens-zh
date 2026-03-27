import { Uri, window } from 'vscode';
import { Commands } from '../constants';
import type { Container } from '../container';
import { Logger } from '../logger';
import { Messages } from '../messages';
import { RepositoryPicker } from '../quickpicks/repositoryPicker';
import { filterMap } from '../system/array';
import { command } from '../system/command';
import { findOrOpenEditors } from '../system/utils';
import { Command } from './base';

export interface OpenChangedFilesCommandArgs {
	uris?: Uri[];
}

@command()
export class OpenChangedFilesCommand extends Command {
	constructor(private readonly container: Container) {
		super(Commands.OpenChangedFiles);
	}

	async execute(args?: OpenChangedFilesCommandArgs) {
		args = { ...args };

		try {
			if (args.uris == null) {
				const repository = await RepositoryPicker.getRepositoryOrShow('打开所有已变更文件');
				if (repository == null) return;

				const status = await this.container.git.getStatusForRepo(repository.uri);
				if (status == null) {
					void window.showWarningMessage('无法打开已变更文件');

					return;
				}

				args.uris = filterMap(status.files, f => (f.status !== 'D' ? f.uri : undefined));
			}

			findOrOpenEditors(args.uris);
		} catch (ex) {
			Logger.error(ex, 'OpenChangedFilesCommand');
			void Messages.showGenericErrorMessage('无法打开所有已变更文件');
		}
	}
}
