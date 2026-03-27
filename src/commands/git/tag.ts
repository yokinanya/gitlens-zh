import { QuickInputButtons, QuickPickItem } from 'vscode';
import { Container } from '../../container';
import { GitReference, GitTagReference, Repository } from '../../git/models';
import { QuickPickItemOfT } from '../../quickpicks/items/common';
import { FlagsQuickPickItem } from '../../quickpicks/items/flags';
import { ViewsWithRepositoryFolders } from '../../views/viewBase';
import {
	appendReposToTitle,
	AsyncStepResultGenerator,
	inputTagNameStep,
	PartialStepState,
	pickBranchOrTagStep,
	pickRepositoryStep,
	pickTagsStep,
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
	showTags: boolean;
	title: string;
}

type CreateFlags = '--force' | '-m';

interface CreateState {
	subcommand: 'create';
	repo: string | Repository;
	reference: GitReference;
	name: string;
	message: string;
	flags: CreateFlags[];
}

interface DeleteState {
	subcommand: 'delete';
	repo: string | Repository;
	references: GitTagReference | GitTagReference[];
}

type State = CreateState | DeleteState;
type TagStepState<T extends State> = SomeNonNullable<StepState<T>, 'subcommand'>;
type CreateStepState<T extends CreateState = CreateState> = TagStepState<ExcludeSome<T, 'repo', string>>;
type DeleteStepState<T extends DeleteState = DeleteState> = TagStepState<ExcludeSome<T, 'repo', string>>;

const subcommandToTitleMap = new Map<State['subcommand'], string>([
	['create', '创建'],
	['delete', '删除'],
]);
function getTitle(title: string, subcommand: State['subcommand'] | undefined) {
	return subcommand == null ? title : `${subcommandToTitleMap.get(subcommand)} ${title}`;
}

export interface TagGitCommandArgs {
	readonly command: 'tag';
	confirm?: boolean;
	state?: Partial<State>;
}

export class TagGitCommand extends QuickCommand<State> {
	private subcommand: State['subcommand'] | undefined;

	constructor(container: Container, args?: TagGitCommandArgs) {
		super(container, 'tag', 'tag', '标签', {
			description: '创建或删除标签',
		});

		let counter = 0;
		if (args?.state?.subcommand != null) {
			counter++;

			switch (args.state.subcommand) {
				case 'create':
					if (args.state.reference != null) {
						counter++;
					}

					if (args.state.name != null) {
						counter++;
					}

					if (args.state.message != null) {
						counter++;
					}

					break;
				case 'delete':
					if (
						args.state.references != null &&
						(!Array.isArray(args.state.references) || args.state.references.length !== 0)
					) {
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
		return this.subcommand === 'delete' ? false : super.canSkipConfirm;
	}

	override get skipConfirmKey() {
		return `${this.key}${this.subcommand == null ? '' : `-${this.subcommand}`}:${this.pickedVia}`;
	}

	protected async *steps(state: PartialStepState<State>): StepGenerator {
		const context: Context = {
			repos: this.container.git.openRepositories,
			associatedView: this.container.tagsView,
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

			context.title = getTitle(state.subcommand === 'delete' ? '标签' : this.title, state.subcommand);

			switch (state.subcommand) {
				case 'create': {
					yield* this.createCommandSteps(state as CreateStepState, context);
					// Clear any chosen name, since we are exiting this subcommand
					state.name = undefined;
					break;
				}
				case 'delete':
					yield* this.deleteCommandSteps(state as DeleteStepState, context);
					break;
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
					label: '创建',
					description: '创建新标签',
					picked: state.subcommand === 'create',
					item: 'create',
				},
				{
					label: '删除',
					description: '删除指定标签',
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
		if (state.flags == null) {
			state.flags = [];
		}

		while (this.canStepsContinue(state)) {
			if (state.counter < 3 || state.reference == null) {
				const result = yield* pickBranchOrTagStep(state, context, {
					placeholder: context => `选择分支${context.showTags ? '或标签' : ''}以从中创建新标签`,
					picked: state.reference?.ref ?? (await state.repo.getBranch())?.ref,
					titleContext: '，来源为',
					value: GitReference.isRevision(state.reference) ? state.reference.ref : undefined,
				});
				// Always break on the first step (so we will go back)
				if (result === StepResult.Break) break;

				state.reference = result;
			}

			if (state.counter < 4 || state.name == null) {
				const result = yield* inputTagNameStep(state, context, {
					placeholder: '请输入新标签名称',
					titleContext: `，位置为 ${GitReference.toString(state.reference, { capitalize: true, icon: false })}`,
					value: state.name ?? GitReference.getNameWithoutRemote(state.reference),
				});
				if (result === StepResult.Break) continue;

				state.name = result;
			}

			if (state.counter < 5 || state.message == null) {
				const result = yield* this.createCommandInputMessageStep(state, context);
				if (result === StepResult.Break) continue;

				state.message = result;
			}

			if (state.message.length !== 0 && !state.flags.includes('-m')) {
				state.flags.push('-m');
			}

			if (this.confirm(state.confirm)) {
				const result = yield* this.createCommandConfirmStep(state, context);
				if (result === StepResult.Break) continue;

				state.flags = result;
			}

			QuickCommand.endSteps(state);
			void state.repo.tag(
				...state.flags,
				...(state.message.length !== 0 ? [`"${state.message}"`] : []),
				state.name,
				state.reference.ref,
			);
		}
	}

	private async *createCommandInputMessageStep(
		state: CreateStepState,
		context: Context,
	): AsyncStepResultGenerator<string> {
		const step = QuickCommand.createInputStep({
			title: appendReposToTitle(
				`${context.title}，位置为 ${GitReference.toString(state.reference, { capitalize: true, icon: false })}`,
				state,
				context,
			),
			placeholder: '请输入可选的注释消息',
			value: state.message,
			prompt: '输入可选消息',
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
		state: CreateStepState<CreateState>,
		context: Context,
	): StepResultGenerator<CreateFlags[]> {
		const step: QuickPickStep<FlagsQuickPickItem<CreateFlags>> = QuickCommand.createConfirmStep(
			appendReposToTitle(`确认${context.title}`, state, context),
			[
				FlagsQuickPickItem.create<CreateFlags>(state.flags, state.message.length !== 0 ? ['-m'] : [], {
					label: context.title,
					description: state.message.length !== 0 ? '-m' : '',
					detail: `将在 ${GitReference.toString(state.reference)} 创建名为 ${state.name} 的新标签`,
				}),
				FlagsQuickPickItem.create<CreateFlags>(
					state.flags,
					state.message.length !== 0 ? ['--force', '-m'] : ['--force'],
					{
						label: `强制${context.title}`,
						description: `--force${state.message.length !== 0 ? ' -m' : ''}`,
						detail: `将强制在 ${GitReference.toString(state.reference)} 创建名为 ${state.name} 的新标签`,
					},
				),
			],
			context,
		);
		const selection: StepSelection<typeof step> = yield step;
		return QuickCommand.canPickStepContinue(step, state, selection) ? selection[0].item : StepResult.Break;
	}

	private async *deleteCommandSteps(state: DeleteStepState, context: Context): StepGenerator {
		while (this.canStepsContinue(state)) {
			if (state.references != null && !Array.isArray(state.references)) {
				state.references = [state.references];
			}

			if (state.counter < 3 || state.references == null || state.references.length === 0) {
				context.title = getTitle('标签', state.subcommand);

				const result = yield* pickTagsStep(state, context, {
					picked: state.references?.map(r => r.ref),
					placeholder: '选择要删除的标签',
				});
				// Always break on the first step (so we will go back)
				if (result === StepResult.Break) break;

				state.references = result;
			}

			context.title = getTitle(
				state.references.length === 1 ? '标签' : `${state.references.length} 个标签`,
				state.subcommand,
			);

			const result = yield* this.deleteCommandConfirmStep(state, context);
			if (result === StepResult.Break) continue;

			QuickCommand.endSteps(state);
			void state.repo.tagDelete(state.references);
		}
	}

	private *deleteCommandConfirmStep(
		state: DeleteStepState<DeleteState>,
		context: Context,
	): StepResultGenerator<void> {
		const step: QuickPickStep<QuickPickItem> = QuickCommand.createConfirmStep(
			appendReposToTitle(`确认${context.title}`, state, context),
			[
				{
					label: context.title,
					detail: `将删除 ${GitReference.toString(state.references)}`,
				},
			],
			context,
		);
		const selection: StepSelection<typeof step> = yield step;
		return QuickCommand.canPickStepContinue(step, state, selection) ? undefined : StepResult.Break;
	}
}
