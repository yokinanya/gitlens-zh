import { Container } from '../../container';
import { GitBranch, GitLog, GitReference, GitRevision, Repository } from '../../git/models';
import { Directive, DirectiveQuickPickItem } from '../../quickpicks/items/directive';
import { FlagsQuickPickItem } from '../../quickpicks/items/flags';
import { ViewsWithRepositoryFolders } from '../../views/viewBase';
import {
	appendReposToTitle,
	AsyncStepResultGenerator,
	PartialStepState,
	pickBranchOrTagStep,
	pickCommitStep,
	pickRepositoryStep,
	QuickCommand,
	QuickCommandButtons,
	QuickPickStep,
	StepGenerator,
	StepResult,
	StepSelection,
	StepState,
} from '../quickCommand';

interface Context {
	repos: Repository[];
	associatedView: ViewsWithRepositoryFolders;
	cache: Map<string, Promise<GitLog | undefined>>;
	destination: GitBranch;
	pickCommit: boolean;
	pickCommitForItem: boolean;
	selectedBranchOrTag: GitReference | undefined;
	showTags: boolean;
	title: string;
}

type Flags = '--ff-only' | '--no-ff' | '--squash' | '--no-commit';

interface State {
	repo: string | Repository;
	reference: GitReference;
	flags: Flags[];
}

export interface MergeGitCommandArgs {
	readonly command: 'merge';
	state?: Partial<State>;
}

type MergeStepState<T extends State = State> = ExcludeSome<StepState<T>, 'repo', string>;

export class MergeGitCommand extends QuickCommand<State> {
	constructor(container: Container, args?: MergeGitCommandArgs) {
		super(container, 'merge', 'merge', '合并', {
			description: '将指定分支中的更改合并到当前分支',
		});

		let counter = 0;
		if (args?.state?.repo != null) {
			counter++;
		}

		if (args?.state?.reference != null) {
			counter++;
		}

		this.initialState = {
			counter: counter,
			confirm: true,
			...args?.state,
		};
	}

	override get canSkipConfirm(): boolean {
		return false;
	}

	execute(state: MergeStepState) {
		return state.repo.merge(...state.flags, state.reference.ref);
	}

	protected async *steps(state: PartialStepState<State>): StepGenerator {
		const context: Context = {
			repos: this.container.git.openRepositories,
			associatedView: this.container.commitsView,
			cache: new Map<string, Promise<GitLog | undefined>>(),
			destination: undefined!,
			pickCommit: false,
			pickCommitForItem: false,
			selectedBranchOrTag: undefined,
			showTags: true,
			title: this.title,
		};

		if (state.flags == null) {
			state.flags = [];
		}

		let skippedStepOne = false;

		while (this.canStepsContinue(state)) {
			context.title = this.title;

			if (state.counter < 1 || state.repo == null || typeof state.repo === 'string') {
				skippedStepOne = false;
				if (context.repos.length === 1) {
					skippedStepOne = true;
					if (state.repo == null) {
						state.counter++;
					}

					state.repo = context.repos[0];
				} else {
					const result = yield* pickRepositoryStep(state, context);
					// Always break on the first step (so we will go back)
					if (result === StepResult.Break) break;

					state.repo = result;
				}
			}

			if (context.destination == null) {
				const branch = await state.repo.getBranch();
				if (branch == null) break;

				context.destination = branch;
			}

			context.title = `${this.title}到 ${GitReference.toString(context.destination, { icon: false })}`;
			context.pickCommitForItem = false;

			if (state.counter < 2 || state.reference == null) {
				const pickCommitToggle = new QuickCommandButtons.PickCommitToggle(context.pickCommit, context, () => {
					context.pickCommit = !context.pickCommit;
					pickCommitToggle.on = context.pickCommit;
				});

				const result: StepResult<GitReference> = yield* pickBranchOrTagStep(state as MergeStepState, context, {
					placeholder: context => `选择要合并的分支${context.showTags ? '或标签' : ''}`,
					picked: context.selectedBranchOrTag?.ref,
					value: context.selectedBranchOrTag == null ? state.reference?.ref : undefined,
					additionalButtons: [pickCommitToggle],
				});
				if (result === StepResult.Break) {
					// If we skipped the previous step, make sure we back up past it
					if (skippedStepOne) {
						state.counter--;
					}

					continue;
				}

				state.reference = result;
				context.selectedBranchOrTag = undefined;
			}

			if (!GitReference.isRevision(state.reference)) {
				context.selectedBranchOrTag = state.reference;
			}

			if (
				state.counter < 3 &&
				context.selectedBranchOrTag != null &&
				(context.pickCommit || context.pickCommitForItem || state.reference.ref === context.destination.ref)
			) {
				const ref = context.selectedBranchOrTag.ref;

				let log = context.cache.get(ref);
				if (log == null) {
					log = this.container.git.getLog(state.repo.path, { ref: ref, merges: false });
					context.cache.set(ref, log);
				}

				const result: StepResult<GitReference> = yield* pickCommitStep(state as MergeStepState, context, {
					ignoreFocusOut: true,
					log: await log,
					onDidLoadMore: log => context.cache.set(ref, Promise.resolve(log)),
					placeholder: (context, log) =>
						log == null
							? `未在 ${GitReference.toString(context.selectedBranchOrTag, {
									icon: false,
							  })} 上找到提交`
							: `选择要合并到 ${GitReference.toString(context.destination, {
									icon: false,
							  })} 的提交`,
					picked: state.reference?.ref,
				});
				if (result === StepResult.Break) continue;

				state.reference = result;
			}

			const result = yield* this.confirmStep(state as MergeStepState, context);
			if (result === StepResult.Break) continue;

			state.flags = result;

			QuickCommand.endSteps(state);
			this.execute(state as MergeStepState);
		}

		return state.counter < 0 ? StepResult.Break : undefined;
	}

	private async *confirmStep(state: MergeStepState, context: Context): AsyncStepResultGenerator<Flags[]> {
		const aheadBehind = await this.container.git.getAheadBehindCommitCount(state.repo.path, [
			GitRevision.createRange(context.destination.name, state.reference.name),
		]);
		const count = aheadBehind != null ? aheadBehind.ahead + aheadBehind.behind : 0;
		if (count === 0) {
			const step: QuickPickStep<DirectiveQuickPickItem> = this.createConfirmStep(
				appendReposToTitle(`确认${context.title}`, state, context),
				[],
				DirectiveQuickPickItem.create(Directive.Cancel, true, {
					label: `取消${this.title}`,
					detail: `${GitReference.toString(context.destination, {
						capitalize: true,
					})} 与 ${GitReference.toString(state.reference)} 保持同步`,
				}),
			);
			const selection: StepSelection<typeof step> = yield step;
			QuickCommand.canPickStepContinue(step, state, selection);
			return StepResult.Break;
		}

		const step: QuickPickStep<FlagsQuickPickItem<Flags>> = this.createConfirmStep(
			appendReposToTitle(`确认${context.title}`, state, context),
			[
				FlagsQuickPickItem.create<Flags>(state.flags, [], {
					label: this.title,
					detail: `将把 ${count} 次提交从 ${GitReference.toString(state.reference)} 合并到 ${GitReference.toString(context.destination)}`,
				}),
				FlagsQuickPickItem.create<Flags>(state.flags, ['--ff-only'], {
					label: `快进${this.title}`,
					description: '--ff-only',
					detail: `将以快进方式把 ${count} 次提交从 ${GitReference.toString(state.reference)} 合并到 ${GitReference.toString(context.destination)}`,
				}),
				FlagsQuickPickItem.create<Flags>(state.flags, ['--squash'], {
					label: `压缩${this.title}`,
					description: '--squash',
					detail: `将把来自 ${GitReference.toString(state.reference)} 的 ${count} 次提交压缩为一次提交，再合并到 ${GitReference.toString(context.destination)}`,
				}),
				FlagsQuickPickItem.create<Flags>(state.flags, ['--no-ff'], {
					label: `非快进${this.title}`,
					description: '--no-ff',
					detail: `将创建合并提交，把 ${count} 次提交从 ${GitReference.toString(state.reference)} 合并到 ${GitReference.toString(context.destination)}`,
				}),
				FlagsQuickPickItem.create<Flags>(state.flags, ['--no-ff', '--no-commit'], {
					label: `非快进且不提交的${this.title}`,
					description: '--no-ff --no-commit',
					detail: `将把 ${count} 次提交从 ${GitReference.toString(state.reference)} 合并到 ${GitReference.toString(context.destination)}，但不提交`,
				}),
			],
		);
		const selection: StepSelection<typeof step> = yield step;
		return QuickCommand.canPickStepContinue(step, state, selection) ? selection[0].item : StepResult.Break;
	}
}
