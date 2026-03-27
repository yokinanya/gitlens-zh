import { TextDocumentShowOptions, TextEditor, Uri } from 'vscode';
import { Commands, GlyphChars, quickPickTitleMaxChars } from '../constants';
import type { Container } from '../container';
import { GitUri } from '../git/gitUri';
import { GitReference, GitRevision } from '../git/models';
import { Messages } from '../messages';
import { StashPicker } from '../quickpicks/commitPicker';
import { ReferencePicker } from '../quickpicks/referencePicker';
import { command, executeCommand } from '../system/command';
import { basename } from '../system/path';
import { pad } from '../system/string';
import { ActiveEditorCommand, getCommandUri } from './base';
import { DiffWithCommandArgs } from './diffWith';

export interface DiffWithRevisionFromCommandArgs {
	line?: number;
	showOptions?: TextDocumentShowOptions;
	stash?: boolean;
}

@command()
export class DiffWithRevisionFromCommand extends ActiveEditorCommand {
	constructor(private readonly container: Container) {
		super(Commands.DiffWithRevisionFrom);
	}

	async execute(editor?: TextEditor, uri?: Uri, args?: DiffWithRevisionFromCommandArgs) {
		uri = getCommandUri(uri, editor);
		if (uri == null) return;

		const gitUri = await GitUri.fromUri(uri);
		if (!gitUri.repoPath) {
			void Messages.showNoRepositoryWarningMessage('无法打开文件比较');

			return;
		}

		args = { ...args };
		if (args.line == null) {
			args.line = editor?.selection.active.line ?? 0;
		}

		const path = this.container.git.getRelativePath(gitUri, gitUri.repoPath);

		let ref;
		let sha;
		if (args?.stash) {
			const title = `打开与储藏的对比${pad(GlyphChars.Dot, 2, 2)}`;
			const pick = await StashPicker.show(
				this.container.git.getStash(gitUri.repoPath),
				`${title}${gitUri.getFormattedFileName({ truncateTo: quickPickTitleMaxChars - title.length })}`,
				'选择要比较的储藏',
				{
					empty: `未找到包含 '${gitUri.getFormattedFileName()}' 的储藏`,
					// Stashes should always come with files, so this should be fine (but protect it just in case)
					filter: c => c.files?.some(f => f.path === path || f.originalPath === path) ?? true,
				},
			);
			if (pick == null) return;

			ref = pick.ref;
			sha = ref;
		} else {
			const title = `打开与分支或标签的对比${pad(GlyphChars.Dot, 2, 2)}`;
			const pick = await ReferencePicker.show(
				gitUri.repoPath,
				`${title}${gitUri.getFormattedFileName({ truncateTo: quickPickTitleMaxChars - title.length })}`,
				'选择要比较的分支或标签',
				{
					allowEnteringRefs: true,
					// checkmarks: false,
				},
			);
			if (pick == null) return;

			ref = pick.ref;
			sha = GitReference.isBranch(pick) && pick.remote ? `remotes/${ref}` : ref;
		}

		if (ref == null) return;

		let renamedUri: Uri | undefined;
		let renamedTitle: string | undefined;

		// Check to see if this file has been renamed
		const files = await this.container.git.getDiffStatus(gitUri.repoPath, 'HEAD', ref, { filters: ['R', 'C'] });
		if (files != null) {
			const rename = files.find(s => s.path === path);
			if (rename?.originalPath != null) {
				renamedUri = this.container.git.getAbsoluteUri(rename.originalPath, gitUri.repoPath);
				renamedTitle = `${basename(rename.originalPath)} (${GitRevision.shorten(ref)})`;
			}
		}

		void (await executeCommand<DiffWithCommandArgs>(Commands.DiffWith, {
			repoPath: gitUri.repoPath,
			lhs: {
				sha: sha,
				uri: renamedUri ?? gitUri,
				title: renamedTitle ?? `${basename(gitUri.fsPath)} (${GitRevision.shorten(ref)})`,
			},
			rhs: {
				sha: '',
				uri: gitUri,
			},
			line: args.line,
			showOptions: args.showOptions,
		}));
	}
}
