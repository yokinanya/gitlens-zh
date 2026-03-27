import { window } from 'vscode';
import { viewsConfigKeys } from '../configuration';
import { Commands, CoreCommands } from '../constants';
import type { Container } from '../container';
import { command, executeCommand, executeCoreCommand } from '../system/command';
import { Command } from './base';

enum ViewsLayout {
	GitLens = 'gitlens',
	SourceControl = 'scm',
}

export interface SetViewsLayoutCommandArgs {
	layout: ViewsLayout;
}

@command()
export class SetViewsLayoutCommand extends Command {
	constructor(private readonly container: Container) {
		super(Commands.SetViewsLayout);
	}

	async execute(args?: SetViewsLayoutCommandArgs) {
		let layout = args?.layout;
		if (layout == null) {
			const pick = await window.showQuickPick(
				[
					{
						label: '源代码管理布局',
						description: '（默认）',
						detail: '在“源代码管理”侧边栏中集中显示所有视图',
						layout: ViewsLayout.SourceControl,
					},
					{
						label: 'GitLens 布局',
						description: '',
						detail: '在 GitLens 侧边栏中集中显示所有视图',
						layout: ViewsLayout.GitLens,
					},
				],
				{
					placeHolder: '选择 GitLens 视图布局',
				},
			);
			if (pick == null) return;

			layout = pick.layout;
		}

		switch (layout) {
			case ViewsLayout.GitLens:
				try {
					// Because of https://github.com/microsoft/vscode/issues/105774, run the command twice which seems to fix things
					let count = 0;
					while (count++ < 2) {
						void (await executeCoreCommand(CoreCommands.MoveViews, {
							viewIds: viewsConfigKeys.map(view => `gitlens.views.${view}`),
							destinationId: 'workbench.view.extension.gitlens',
						}));
					}
				} catch {}

				break;
			case ViewsLayout.SourceControl:
				try {
					// Because of https://github.com/microsoft/vscode/issues/105774, run the command twice which seems to fix things
					let count = 0;
					while (count++ < 2) {
						void (await executeCoreCommand(CoreCommands.MoveViews, {
							viewIds: viewsConfigKeys.map(view => `gitlens.views.${view}`),
							destinationId: 'workbench.view.scm',
						}));
					}
				} catch {
					for (const view of viewsConfigKeys) {
						void (await executeCommand(`gitlens.views.${view}.resetViewLocation`));
					}
				}

				break;
		}
	}
}
