import { Container } from '../../container';
import { GitBranch, GitLog, GitReference, GitRevisionReference, Repository } from '../../git/models';
import { FlagsQuickPickItem } from '../../quickpicks/items/flags';
import { ViewsWithRepositoryFolders } from '../../views/viewBase';
import {
	appendReposToTitle,
	PartialStepState,
	pickCommitStep,
	pickRepositoryStep,
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
	cache: Map<string, Promise<GitLog | undefined>>;
	destination: GitBranch;
	title: string;
}

type Flags = '--hard' | '--soft';

interface State {
	repo: string | Repository;
	reference: GitRevisionReference;
	flags: Flags[];
}

export interface ResetGitCommandArgs {
	readonly command: 'reset';
	confirm?: boolean;
	state?: Partial<State>;
}

type ResetStepState<T extends State = State> = ExcludeSome<StepState<T>, 'repo', string>;

export class ResetGitCommand extends QuickCommand<State> {
	constructor(container: Container, args?: ResetGitCommandArgs) {
		super(container, 'reset', 'reset', '重置', { description: '将当前分支重置到指定提交' });

		let counter = 0;
		if (args?.state?.repo != null) {
			counter++;
		}

		if (args?.state?.reference != null) {
			counter++;
		}

		this.initialState = {
			counter: counter,
			confirm: args?.confirm ?? true,
			...args?.state,
		};
		this._canSkipConfirm = !this.initialState.confirm;
	}

	private _canSkipConfirm: boolean = false;
	override get canSkipConfirm(): boolean {
		return this._canSkipConfirm;
	}

	execute(state: ResetStepState) {
		return state.repo.reset(...state.flags, state.reference.ref);
	}

	protected async *steps(state: PartialStepState<State>): StepGenerator {
		const context: Context = {
			repos: this.container.git.openRepositories,
			associatedView: this.container.commitsView,
			cache: new Map<string, Promise<GitLog | undefined>>(),
			destination: undefined!,
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

			context.title = `${this.title} ${GitReference.toString(context.destination, { icon: false })}`;

			if (state.counter < 2 || state.reference == null) {
				const ref = context.destination.ref;

				let log = context.cache.get(ref);
				if (log == null) {
					log = this.container.git.getLog(state.repo.path, { ref: ref, merges: false });
					context.cache.set(ref, log);
				}

				const result: StepResult<GitReference> = yield* pickCommitStep(state as ResetStepState, context, {
					log: await log,
					onDidLoadMore: log => context.cache.set(ref, Promise.resolve(log)),
					placeholder: (context, log) =>
						log == null
							? `${context.destination.name} 没有提交`
							: `选择要将 ${context.destination.name} 重置到的提交`,
					picked: state.reference?.ref,
				});
				if (result === StepResult.Break) {
					// If we skipped the previous step, make sure we back up past it
					if (skippedStepOne) {
						state.counter--;
					}

					continue;
				}

				state.reference = result;
			}

			if (this.confirm(state.confirm)) {
				const result = yield* this.confirmStep(state as ResetStepState, context);
				if (result === StepResult.Break) continue;

				state.flags = result;
			}

			QuickCommand.endSteps(state);
			this.execute(state as ResetStepState);
		}

		return state.counter < 0 ? StepResult.Break : undefined;
	}

	private *confirmStep(state: ResetStepState, context: Context): StepResultGenerator<Flags[]> {
		const step: QuickPickStep<FlagsQuickPickItem<Flags>> = this.createConfirmStep(
			appendReposToTitle(`确认${context.title}`, state, context),
			[
				FlagsQuickPickItem.create<Flags>(state.flags, [], {
					label: this.title,
					detail: `将重置 ${GitReference.toString(context.destination)} 到 ${GitReference.toString(
						state.reference,
					)}（保留工作树中的更改）`,
				}),
				FlagsQuickPickItem.create<Flags>(state.flags, ['--soft'], {
					label: `软${this.title}`,
					description: '--soft',
					detail: `将软重置 ${GitReference.toString(context.destination)} 到 ${GitReference.toString(
						state.reference,
					)}（保留索引和工作树中的更改）`,
				}),
				FlagsQuickPickItem.create<Flags>(state.flags, ['--hard'], {
					label: `硬${this.title}`,
					description: '--hard',
					detail: `将硬重置 ${GitReference.toString(context.destination)} 到 ${GitReference.toString(
						state.reference,
					)}（丢弃所有更改）`,
				}),
			],
		);
		const selection: StepSelection<typeof step> = yield step;
		return QuickCommand.canPickStepContinue(step, state, selection) ? selection[0].item : StepResult.Break;
	}
}
