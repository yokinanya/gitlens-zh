import { MessageItem, QuickInputButtons, Uri, window } from 'vscode';
import { configuration } from '../../configuration';
import { Container } from '../../container';
import { PlusFeatures } from '../../features';
import {
	WorktreeCreateError,
	WorktreeCreateErrorReason,
	WorktreeDeleteError,
	WorktreeDeleteErrorReason,
} from '../../git/errors';
import { GitReference, GitWorktree, Repository } from '../../git/models';
import { Messages } from '../../messages';
import { QuickPickItemOfT, QuickPickSeparator } from '../../quickpicks/items/common';
import { Directive } from '../../quickpicks/items/directive';
import { FlagsQuickPickItem } from '../../quickpicks/items/flags';
import { basename, isDescendent } from '../../system/path';
import { truncateLeft } from '../../system/string';
import { OpenWorkspaceLocation } from '../../system/utils';
import { ViewsWithRepositoryFolders } from '../../views/viewBase';
import { GitActions } from '../gitCommands.actions';
import {
	appendReposToTitle,
	AsyncStepResultGenerator,
	CustomStep,
	ensureAccessStep,
	inputBranchNameStep,
	PartialStepState,
	pickBranchOrTagStep,
	pickRepositoryStep,
	pickWorktreesStep,
	pickWorktreeStep,
	QuickCommand,
	QuickPickStep,
	StepGenerator,
	StepResult,
	StepResultGenerator,
	StepSelection,
	StepState,
} from '../quickCommand';

interface Context {
	repos: Repository[];
	associatedView: ViewsWithRepositoryFolders;
	defaultUri?: Uri;
	pickedUri?: Uri;
	showTags: boolean;
	title: string;
	worktrees?: GitWorktree[];
}

type CreateFlags = '--force' | '-b' | '--detach' | '--direct';

interface CreateState {
	subcommand: 'create';
	repo: string | Repository;
	uri: Uri;
	reference?: GitReference;
	createBranch: string;
	flags: CreateFlags[];
}

type DeleteFlags = '--force';

interface DeleteState {
	subcommand: 'delete';
	repo: string | Repository;
	uris: Uri[];
	flags: DeleteFlags[];
}

type OpenFlags = '--new-window' | '--reveal-explorer';

interface OpenState {
	subcommand: 'open';
	repo: string | Repository;
	uri: Uri;
	flags: OpenFlags[];
}

type State = CreateState | DeleteState | OpenState;
type WorktreeStepState<T extends State> = SomeNonNullable<StepState<T>, 'subcommand'>;
type CreateStepState<T extends CreateState = CreateState> = WorktreeStepState<ExcludeSome<T, 'repo', string>>;
type DeleteStepState<T extends DeleteState = DeleteState> = WorktreeStepState<ExcludeSome<T, 'repo', string>>;
type OpenStepState<T extends OpenState = OpenState> = WorktreeStepState<ExcludeSome<T, 'repo', string>>;

const subcommandToTitleMap = new Map<State['subcommand'], string>([
	['create', '创建'],
	['delete', '删除'],
	['open', '打开'],
]);
function getTitle(title: string, subcommand: State['subcommand'] | undefined) {
	return subcommand == null ? title : `${subcommandToTitleMap.get(subcommand)} ${title}`;
}

export interface WorktreeGitCommandArgs {
	readonly command: 'worktree';
	confirm?: boolean;
	state?: Partial<State>;
}

export class WorktreeGitCommand extends QuickCommand<State> {
	private subcommand: State['subcommand'] | undefined;
	private canSkipConfirmOverride: boolean | undefined;

	constructor(container: Container, args?: WorktreeGitCommandArgs) {
		super(container, 'worktree', 'worktree', '工作树', {
			description: '打开、创建或删除工作树',
		});

		let counter = 0;
		if (args?.state?.subcommand != null) {
			counter++;

			switch (args.state.subcommand) {
				case 'create':
					if (args.state.uri != null) {
						counter++;
					}

					if (args.state.reference != null) {
						counter++;
					}

					break;
				case 'delete':
					if (args.state.uris != null && (!Array.isArray(args.state.uris) || args.state.uris.length !== 0)) {
						counter++;
					}

					break;
				case 'open':
					if (args.state.uri != null) {
						counter++;
					}

					break;
			}
		}

		if (args?.state?.repo != null) {
			counter++;
		}

		this.initialState = {
			counter: counter,
			confirm: args?.confirm,
			...args?.state,
		};
	}

	override get canConfirm(): boolean {
		return this.subcommand != null;
	}

	override get canSkipConfirm(): boolean {
		return this.canSkipConfirmOverride ?? false;
	}

	override get skipConfirmKey() {
		return `${this.key}${this.subcommand == null ? '' : `-${this.subcommand}`}:${this.pickedVia}`;
	}

	protected async *steps(state: PartialStepState<State>): StepGenerator {
		const context: Context = {
			repos: Container.instance.git.openRepositories,
			associatedView: Container.instance.worktreesView,
			showTags: false,
			title: this.title,
		};

		let skippedStepTwo = false;

		while (this.canStepsContinue(state)) {
			context.title = this.title;

			if (state.counter < 1 || state.subcommand == null) {
				this.subcommand = undefined;

				const result = yield* this.pickSubcommandStep(state);
				// Always break on the first step (so we will go back)
				if (result === StepResult.Break) break;

				state.subcommand = result;
			}

			this.subcommand = state.subcommand;

			if (state.counter < 2 || state.repo == null || typeof state.repo === 'string') {
				skippedStepTwo = false;
				if (context.repos.length === 1) {
					skippedStepTwo = true;
					state.counter++;

					state.repo = context.repos[0];
				} else {
					const result = yield* pickRepositoryStep(state, context);
					if (result === StepResult.Break) continue;

					state.repo = result;
				}
			}

			const result = yield* ensureAccessStep(state as any, context, PlusFeatures.Worktrees);
			if (result === StepResult.Break) break;

			context.title = getTitle(state.subcommand === 'delete' ? '工作树' : this.title, state.subcommand);

			switch (state.subcommand) {
				case 'create': {
					yield* this.createCommandSteps(state as CreateStepState, context);
					// Clear any chosen path, since we are exiting this subcommand
					state.uri = undefined;
					break;
				}
				case 'delete': {
					if (state.uris != null && !Array.isArray(state.uris)) {
						state.uris = [state.uris];
					}

					yield* this.deleteCommandSteps(state as DeleteStepState, context);
					break;
				}
				case 'open': {
					yield* this.openCommandSteps(state as OpenStepState, context);
					break;
				}
				default:
					QuickCommand.endSteps(state);
					break;
			}

			// If we skipped the previous step, make sure we back up past it
			if (skippedStepTwo) {
				state.counter--;
			}
		}

		return state.counter < 0 ? StepResult.Break : undefined;
	}

	private *pickSubcommandStep(state: PartialStepState<State>): StepResultGenerator<State['subcommand']> {
		const step = QuickCommand.createPickStep<QuickPickItemOfT<State['subcommand']>>({
			title: this.title,
			placeholder: `选择${this.label}命令`,
			items: [
				{
					label: '打开',
					description: '打开指定工作树',
					picked: state.subcommand === 'open',
					item: 'open',
				},
				{
					label: '创建',
					description: '创建新工作树',
					picked: state.subcommand === 'create',
					item: 'create',
				},
				{
					label: '删除',
					description: '删除指定工作树',
					picked: state.subcommand === 'delete',
					item: 'delete',
				},
			],
			buttons: [QuickInputButtons.Back],
		});
		const selection: StepSelection<typeof step> = yield step;
		return QuickCommand.canPickStepContinue(step, state, selection) ? selection[0].item : StepResult.Break;
	}

	private async *createCommandSteps(state: CreateStepState, context: Context): AsyncStepResultGenerator<void> {
		if (context.defaultUri == null) {
			context.defaultUri = await state.repo.getWorktreesDefaultUri();
		}

		if (state.flags == null) {
			state.flags = [];
		}

		context.pickedUri = undefined;

		// Don't allow skipping the confirm step
		state.confirm = true;
		this.canSkipConfirmOverride = undefined;

		while (this.canStepsContinue(state)) {
			if (state.counter < 3 || state.reference == null) {
				const result = yield* pickBranchOrTagStep(state, context, {
					placeholder: context => `选择分支${context.showTags ? '或标签' : ''}以为其创建新工作树`,
					picked: state.reference?.ref ?? (await state.repo.getBranch())?.ref,
					titleContext: '，用于',
					value: GitReference.isRevision(state.reference) ? state.reference.ref : undefined,
				});
				// Always break on the first step (so we will go back)
				if (result === StepResult.Break) break;

				state.reference = result;
			}

			if (state.counter < 4 || state.uri == null) {
				if (
					state.reference != null &&
					!configuration.get('worktrees.promptForLocation', state.repo.folder) &&
					context.defaultUri != null
				) {
					state.uri = context.defaultUri;
				} else {
					const result = yield* this.createCommandChoosePathStep(state, context, {
						titleContext: `，用于 ${GitReference.toString(state.reference, {
							capitalize: true,
							icon: false,
							label: state.reference.refType !== 'branch',
						})}`,
					});
					if (result === StepResult.Break) continue;

					state.uri = result;
					// Keep track of the actual uri they picked, because we will modify it in later steps
					context.pickedUri = state.uri;
				}
			}

			if (this.confirm(state.confirm)) {
				const result = yield* this.createCommandConfirmStep(state, context);
				if (result === StepResult.Break) continue;

				[state.uri, state.flags] = result;
			}

			// Reset any confirmation overrides
			state.confirm = true;
			this.canSkipConfirmOverride = undefined;

			if (state.flags.includes('-b') && state.createBranch == null) {
				const result = yield* inputBranchNameStep(state, context, {
					placeholder: '请输入新分支名称',
					titleContext: `，来源为 ${GitReference.toString(state.reference, {
						capitalize: true,
						icon: false,
						label: state.reference.refType !== 'branch',
					})}`,
					value: state.createBranch ?? GitReference.getNameWithoutRemote(state.reference),
				});
				if (result === StepResult.Break) {
					// Clear the flags, since we can backup after the confirm step below (which is non-standard)
					state.flags = [];
					continue;
				}

				state.createBranch = result;
			}

			const uri = state.flags.includes('--direct')
				? state.uri
				: Uri.joinPath(
						state.uri,
						...(state.createBranch ?? state.reference.name).replace(/\\/g, '/').split('/'),
				  );

			try {
				await state.repo.createWorktree(uri, {
					commitish: state.reference?.name,
					createBranch: state.flags.includes('-b') ? state.createBranch : undefined,
					detach: state.flags.includes('--detach'),
					force: state.flags.includes('--force'),
				});
			} catch (ex) {
				if (
					WorktreeCreateError.is(ex, WorktreeCreateErrorReason.AlreadyCheckedOut) &&
					!state.flags.includes('--force')
				) {
					const createBranch: MessageItem = { title: '创建新分支' };
					const force: MessageItem = { title: '仍要创建' };
					const cancel: MessageItem = { title: '取消', isCloseAffordance: true };
					const result = await window.showWarningMessage(
						`无法创建新的工作树，因为 ${GitReference.toString(state.reference, {
							icon: false,
							quoted: true,
						})} 已经被检出。\n\n你想为这个工作树创建一个新分支，还是强制继续创建？`,
						{ modal: true },
						createBranch,
						force,
						cancel,
					);

					if (result === createBranch) {
						state.flags.push('-b');
						this.canSkipConfirmOverride = true;
						state.confirm = false;
						continue;
					}

					if (result === force) {
						state.flags.push('--force');
						this.canSkipConfirmOverride = true;
						state.confirm = false;
						continue;
					}
				} else if (WorktreeCreateError.is(ex, WorktreeCreateErrorReason.AlreadyExists)) {
					void window.showErrorMessage(
						`无法在 '${GitWorktree.getFriendlyPath(uri)}' 中创建新工作树，因为该文件夹已存在且非空。`,
						'确定',
					);
				} else {
					void Messages.showGenericErrorMessage(
						`无法在 '${GitWorktree.getFriendlyPath(uri)}' 中创建新工作树。`,
					);
				}
			}

			QuickCommand.endSteps(state);
		}
	}

	private async *createCommandChoosePathStep(
		state: CreateStepState,
		context: Context,
		options?: { titleContext?: string },
	): AsyncStepResultGenerator<Uri> {
		const step = QuickCommand.createCustomStep<Uri>({
			show: async (_step: CustomStep<Uri>) => {
				const uris = await window.showOpenDialog({
					canSelectFiles: false,
					canSelectFolders: true,
					canSelectMany: false,
					defaultUri: context.pickedUri ?? state.uri ?? context.defaultUri,
					openLabel: '选择工作树位置',
					title: `${appendReposToTitle(
						`选择工作树位置${options?.titleContext ?? ''}`,
						state,
						context,
					)}`,
				});

				if (uris == null || uris.length === 0) return Directive.Back;

				return uris[0];
			},
		});

		const value: StepSelection<typeof step> = yield step;

		if (
			!QuickCommand.canStepContinue(step, state, value) ||
			!(await QuickCommand.canInputStepContinue(step, state, value))
		) {
			return StepResult.Break;
		}

		return value;
	}

	private *createCommandConfirmStep(
		state: CreateStepState,
		context: Context,
	): StepResultGenerator<[Uri, CreateFlags[]]> {
		/**
		 * Here are the rules for creating the recommended path for the new worktree:
		 *
		 * If the user picks a folder outside the repo, it will be `<chosen-path>/<repo>.worktrees/<?branch>`
		 * If the user picks the repo folder, it will be `<repo>/../<repo>.worktrees/<?branch>`
		 * If the user picks a folder inside the repo, it will be `<repo>/../<repo>.worktrees/<?branch>`
		 */

		const pickedUri = context.pickedUri ?? state.uri;
		const pickedFriendlyPath = truncateLeft(GitWorktree.getFriendlyPath(pickedUri), 60);

		let canCreateDirectlyInPicked = true;
		let recommendedRootUri;

		const repoUri = state.repo.uri;
		if (repoUri.toString() !== pickedUri.toString()) {
			if (isDescendent(pickedUri, repoUri)) {
				recommendedRootUri = Uri.joinPath(repoUri, '..', `${basename(repoUri.path)}.worktrees`);
			} else {
				recommendedRootUri = Uri.joinPath(pickedUri, `${basename(repoUri.path)}.worktrees`);
			}
		} else {
			recommendedRootUri = Uri.joinPath(repoUri, '..', `${basename(repoUri.path)}.worktrees`);
			// Don't allow creating directly into the main worktree folder
			canCreateDirectlyInPicked = false;
		}

		const recommendedUri =
			state.reference != null
				? Uri.joinPath(recommendedRootUri, ...state.reference.name.replace(/\\/g, '/').split('/'))
				: recommendedRootUri;
		const recommendedFriendlyPath = truncateLeft(GitWorktree.getFriendlyPath(recommendedUri), 65);

		const recommendedNewBranchFriendlyPath = truncateLeft(
			GitWorktree.getFriendlyPath(Uri.joinPath(recommendedRootUri, '<new-branch-name>')),
			60,
		);

		const step: QuickPickStep<FlagsQuickPickItem<CreateFlags, Uri>> = QuickCommand.createConfirmStep(
			appendReposToTitle(`确认${context.title}`, state, context),
			[
				FlagsQuickPickItem.create<CreateFlags, Uri>(
					state.flags,
					[],
					{
						label: context.title,
						description: `用于 ${GitReference.toString(state.reference)}`,
						detail: `将于 $(folder) ${recommendedFriendlyPath} 创建工作树`,
					},
					recommendedRootUri,
				),
				FlagsQuickPickItem.create<CreateFlags, Uri>(
					state.flags,
					['-b'],
					{
						label: '创建新分支和工作树',
						description: `来源为 ${GitReference.toString(state.reference)}`,
						detail: `将于 $(folder) ${recommendedNewBranchFriendlyPath} 创建工作树`,
					},
					recommendedRootUri,
				),
				...(canCreateDirectlyInPicked
					? [
							QuickPickSeparator.create(),
							FlagsQuickPickItem.create<CreateFlags, Uri>(
								state.flags,
								['--direct'],
								{
									label: `${context.title}（直接在文件夹中）`,
									description: `用于 ${GitReference.toString(state.reference)}`,
									detail: `将直接在 $(folder) ${pickedFriendlyPath} 中创建工作树`,
								},
								pickedUri,
							),
							FlagsQuickPickItem.create<CreateFlags, Uri>(
								state.flags,
								['-b', '--direct'],
								{
									label: '创建新分支和工作树（直接在文件夹中）',
									description: `来源为 ${GitReference.toString(state.reference)}`,
									detail: `将直接在 $(folder) ${pickedFriendlyPath} 中创建工作树`,
								},
								pickedUri,
							),
					  ]
					: []),
			] as FlagsQuickPickItem<CreateFlags, Uri>[],
			context,
		);
		const selection: StepSelection<typeof step> = yield step;
		return QuickCommand.canPickStepContinue(step, state, selection)
			? [selection[0].context, selection[0].item]
			: StepResult.Break;
	}

	private async *deleteCommandSteps(state: DeleteStepState, context: Context): StepGenerator {
		context.worktrees = await state.repo.getWorktrees();

		if (state.flags == null) {
			state.flags = [];
		}

		while (this.canStepsContinue(state)) {
			if (state.counter < 3 || state.uris == null || state.uris.length === 0) {
				context.title = getTitle('工作树', state.subcommand);

				const result = yield* pickWorktreesStep(state, context, {
					filter: wt => wt.main || !wt.opened, // Can't delete the main or opened worktree
					includeStatus: true,
					picked: state.uris?.map(uri => uri.toString()),
					placeholder: '选择要删除的工作树',
				});
				// Always break on the first step (so we will go back)
				if (result === StepResult.Break) break;

				state.uris = result.map(w => w.uri);
			}

			context.title = getTitle(
				state.uris.length === 1 ? '工作树' : `${state.uris.length} 个工作树`,
				state.subcommand,
			);

			const result = yield* this.deleteCommandConfirmStep(state, context);
			if (result === StepResult.Break) continue;

			state.flags = result;

			QuickCommand.endSteps(state);

			for (const uri of state.uris) {
				let retry = false;
				do {
					retry = false;
					const force = state.flags.includes('--force');

					try {
						if (force) {
							const worktree = context.worktrees.find(wt => wt.uri.toString() === uri.toString());
							const status = await worktree?.getStatus();
							if (status?.hasChanges ?? false) {
								const confirm: MessageItem = { title: '强制删除' };
								const cancel: MessageItem = { title: '取消', isCloseAffordance: true };
								const result = await window.showWarningMessage(
									`'${uri.fsPath}' 中的工作树存在未提交的更改。\n\n删除它会使这些更改永久丢失。\n此操作不可撤销！\n\n你确定仍要删除吗？`,
									{ modal: true },
									confirm,
									cancel,
								);

								if (result !== confirm) return;
							}
						}

						await state.repo.deleteWorktree(uri, { force: force });
					} catch (ex) {
						if (WorktreeDeleteError.is(ex)) {
							if (ex.reason === WorktreeDeleteErrorReason.MainWorkingTree) {
								void window.showErrorMessage('无法删除主工作树');
							} else if (!force) {
								const confirm: MessageItem = { title: '强制删除' };
								const cancel: MessageItem = { title: '取消', isCloseAffordance: true };
								const result = await window.showErrorMessage(
									ex.reason === WorktreeDeleteErrorReason.HasChanges
										? `无法删除工作树，因为 '${uri.fsPath}' 中存在未提交的更改。\n\n强制删除会使这些更改永久丢失。\n此操作不可撤销！\n\n你要强制删除吗？`
										: `无法删除 '${uri.fsPath}' 中的工作树。\n\n你要尝试强制删除吗？`,
									{ modal: true },
									confirm,
									cancel,
								);

								if (result === confirm) {
									state.flags.push('--force');
									retry = true;
								}
							}
						} else {
							void Messages.showGenericErrorMessage(`无法删除 '${uri.fsPath}' 中的工作树。`);
						}
					}
				} while (retry);
			}
		}
	}

	private *deleteCommandConfirmStep(state: DeleteStepState, context: Context): StepResultGenerator<DeleteFlags[]> {
		const step: QuickPickStep<FlagsQuickPickItem<DeleteFlags>> = QuickCommand.createConfirmStep(
			appendReposToTitle(`确认${context.title}`, state, context),
			[
				FlagsQuickPickItem.create<DeleteFlags>(state.flags, [], {
					label: context.title,
					detail: `将删除 ${state.uris.length === 1 ? '工作树' : `${state.uris.length} 个工作树`}${
						state.uris.length === 1 ? `：$(folder) ${GitWorktree.getFriendlyPath(state.uris[0])}` : ''
					}`,
				}),
				FlagsQuickPickItem.create<DeleteFlags>(state.flags, ['--force'], {
					label: `强制${context.title}`,
					description: '包括所有未提交的更改',
					detail: `将强制删除 ${state.uris.length === 1 ? '工作树' : `${state.uris.length} 个工作树`}${
						state.uris.length === 1 ? `：$(folder) ${GitWorktree.getFriendlyPath(state.uris[0])}` : ''
					}`,
				}),
			],
			context,
		);

		const selection: StepSelection<typeof step> = yield step;
		return QuickCommand.canPickStepContinue(step, state, selection) ? selection[0].item : StepResult.Break;
	}

	private async *openCommandSteps(state: OpenStepState, context: Context): StepGenerator {
		context.worktrees = await state.repo.getWorktrees();

		if (state.flags == null) {
			state.flags = [];
		}

		while (this.canStepsContinue(state)) {
			if (state.counter < 3 || state.uri == null) {
				context.title = getTitle('工作树', state.subcommand);

				const result = yield* pickWorktreeStep(state, context, {
					includeStatus: true,
					picked: state.uri?.toString(),
					placeholder: '选择要打开的工作树',
				});
				// Always break on the first step (so we will go back)
				if (result === StepResult.Break) break;

				state.uri = result.uri;
			}

			context.title = getTitle('工作树', state.subcommand);

			const result = yield* this.openCommandConfirmStep(state, context);
			if (result === StepResult.Break) continue;

			state.flags = result;

			QuickCommand.endSteps(state);

			const worktree = context.worktrees.find(wt => wt.uri.toString() === state.uri.toString())!;
			if (state.flags.includes('--reveal-explorer')) {
				void GitActions.Worktree.revealInFileExplorer(worktree);
			} else {
				GitActions.Worktree.open(worktree, {
					location: state.flags.includes('--new-window')
						? OpenWorkspaceLocation.NewWindow
						: OpenWorkspaceLocation.CurrentWindow,
				});
			}
		}
	}

	private *openCommandConfirmStep(state: OpenStepState, context: Context): StepResultGenerator<OpenFlags[]> {
		const step: QuickPickStep<FlagsQuickPickItem<OpenFlags>> = QuickCommand.createConfirmStep(
			appendReposToTitle(`确认${context.title}`, state, context),
			[
				FlagsQuickPickItem.create<OpenFlags>(state.flags, [], {
					label: context.title,
					detail: `将在当前窗口打开位于 $(folder) ${GitWorktree.getFriendlyPath(state.uri)} 的工作树`,
				}),
				FlagsQuickPickItem.create<OpenFlags>(state.flags, ['--new-window'], {
					label: `在新窗口中${context.title}`,
					detail: `将在新窗口打开位于 $(folder) ${GitWorktree.getFriendlyPath(state.uri)} 的工作树`,
				}),
				FlagsQuickPickItem.create<OpenFlags>(state.flags, ['--reveal-explorer'], {
					label: '在文件资源管理器中显示',
					detail: `将在文件资源管理器中打开位于 $(folder) ${GitWorktree.getFriendlyPath(state.uri)} 的工作树`,
				}),
			],
			context,
		);

		const selection: StepSelection<typeof step> = yield step;
		return QuickCommand.canPickStepContinue(step, state, selection) ? selection[0].item : StepResult.Break;
	}
}
