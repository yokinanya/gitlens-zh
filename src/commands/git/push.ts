import { configuration } from '../../configuration';
import { CoreGitConfiguration, GlyphChars } from '../../constants';
import { Container } from '../../container';
import { GitBranch, GitBranchReference, GitReference, Repository } from '../../git/models';
import { Directive, DirectiveQuickPickItem } from '../../quickpicks/items/directive';
import { FlagsQuickPickItem } from '../../quickpicks/items/flags';
import { isStringArray } from '../../system/array';
import { fromNow } from '../../system/date';
import { pad } from '../../system/string';
import { ViewsWithRepositoryFolders } from '../../views/viewBase';
import {
	appendReposToTitle,
	AsyncStepResultGenerator,
	PartialStepState,
	pickRepositoriesStep,
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
	title: string;
}

type Flags = '--force' | '--set-upstream' | string;

interface State<Repos = string | string[] | Repository | Repository[]> {
	repos: Repos;
	reference?: GitReference;
	flags: Flags[];
}

export interface PushGitCommandArgs {
	readonly command: 'push';
	confirm?: boolean;
	state?: Partial<State>;
}

type PushStepState<T extends State = State> = ExcludeSome<StepState<T>, 'repos', string | string[] | Repository>;

export class PushGitCommand extends QuickCommand<State> {
	constructor(container: Container, args?: PushGitCommandArgs) {
		super(container, 'push', 'push', '推送', {
			description: '将当前分支的更改推送到远程',
		});

		let counter = 0;
		if (args?.state?.repos != null && (!Array.isArray(args.state.repos) || args.state.repos.length !== 0)) {
			counter++;
		}

		this.initialState = {
			counter: counter,
			confirm: args?.confirm,
			...args?.state,
		};
	}

	execute(state: State<Repository[]>) {
		const index = state.flags.indexOf('--set-upstream');
		if (index !== -1) {
			if (!GitReference.isBranch(state.reference)) return Promise.resolve();

			return this.container.git.pushAll(state.repos, {
				force: false,
				publish: { remote: state.flags[index + 1] },
				reference: state.reference,
			});
		}

		return this.container.git.pushAll(state.repos, {
			force: state.flags.includes('--force'),
			reference: state.reference,
		});
	}

	protected async *steps(state: PartialStepState<State>): StepGenerator {
		const context: Context = {
			repos: this.container.git.openRepositories,
			associatedView: this.container.commitsView,
			title: this.title,
		};

		if (state.flags == null) {
			state.flags = [];
		}

		if (state.repos != null && !Array.isArray(state.repos)) {
			state.repos = [state.repos as string];
		}

		let skippedStepOne = false;

		while (this.canStepsContinue(state)) {
			context.title = this.title;

			if (state.counter < 1 || state.repos == null || state.repos.length === 0 || isStringArray(state.repos)) {
				skippedStepOne = false;
				if (context.repos.length === 1) {
					skippedStepOne = true;
					state.counter++;

					state.repos = [context.repos[0]];
				} else if (state.reference != null) {
					const result = yield* pickRepositoryStep(
						{ ...state, repos: undefined, repo: state.reference.repoPath },
						context,
					);
					// Always break on the first step (so we will go back)
					if (result === StepResult.Break) break;

					state.repos = [result];
				} else {
					const result = yield* pickRepositoriesStep(
						state as ExcludeSome<typeof state, 'repos', string | Repository>,
						context,
						{ skipIfPossible: state.counter >= 1 },
					);
					// Always break on the first step (so we will go back)
					if (result === StepResult.Break) break;

					state.repos = result;
				}
			}

			if (this.confirm(state.confirm)) {
				const result = yield* this.confirmStep(state as PushStepState, context);
				if (result === StepResult.Break) {
					// If we skipped the previous step, make sure we back up past it
					if (skippedStepOne) {
						state.counter--;
					}

					continue;
				}

				state.flags = result;
			}

			QuickCommand.endSteps(state);
			void this.execute(state as State<Repository[]>);
		}

		return state.counter < 0 ? StepResult.Break : undefined;
	}

	private async *confirmStep(state: PushStepState, context: Context): AsyncStepResultGenerator<Flags[]> {
		const useForceWithLease = configuration.getAny<boolean>(CoreGitConfiguration.UseForcePushWithLease) ?? false;

		let step: QuickPickStep<FlagsQuickPickItem<Flags>>;

		if (state.repos.length > 1) {
			step = this.createConfirmStep(appendReposToTitle(`确认${context.title}`, state, context), [
				FlagsQuickPickItem.create<Flags>(state.flags, [], {
					label: this.title,
					detail: `将推送 ${state.repos.length} 个仓库`,
				}),
				FlagsQuickPickItem.create<Flags>(state.flags, ['--force'], {
					label: `强制${this.title}${useForceWithLease ? '（带 lease）' : ''}`,
					description: `--force${useForceWithLease ? '-with-lease' : ''}`,
					detail: `将强制推送${useForceWithLease ? '（带 lease）' : ''} ${state.repos.length} 个仓库`,
				}),
			]);
		} else {
			const [repo] = state.repos;

			const items: FlagsQuickPickItem<Flags>[] = [];

			if (GitReference.isBranch(state.reference)) {
				if (state.reference.remote) {
					step = this.createConfirmStep(
					appendReposToTitle(`确认${context.title}`, state, context),
					[],
					DirectiveQuickPickItem.create(Directive.Cancel, true, {
						label: `取消${this.title}`,
						detail: '无法推送远程分支',
					}),
				);
				} else {
					const branch = await repo.getBranch(state.reference.name);

					if (branch != null && branch?.upstream == null) {
						for (const remote of await repo.getRemotes()) {
							items.push(
								FlagsQuickPickItem.create<Flags>(
									state.flags,
									['--set-upstream', remote.name, branch.name],
									{
										label: `将 ${branch.name} 发布到 ${remote.name}`,
										detail: `将把 ${GitReference.toString(branch)} 发布到 ${remote.name}`,
									},
								),
							);
						}

						if (items.length) {
							step = this.createConfirmStep(
								appendReposToTitle('确认发布', state, context),
								items,
								undefined,
								{ placeholder: '确认发布' },
							);
						} else {
							step = this.createConfirmStep(
								appendReposToTitle('确认发布', state, context),
								[],
								DirectiveQuickPickItem.create(Directive.Cancel, true, {
									label: '取消发布',
									detail: '无法发布；未找到远程',
								}),
								{ placeholder: '确认发布' },
							);
						}
					} else if (branch != null && branch?.state.behind > 0) {
						const currentBranch = await repo.getBranch();

						step = this.createConfirmStep(
							appendReposToTitle(`确认${context.title}`, state, context),
							branch.id === currentBranch?.id
								? [
										FlagsQuickPickItem.create<Flags>(state.flags, ['--force'], {
											label: `强制${this.title}${useForceWithLease ? '（带 lease）' : ''}`,
											description: `--force${useForceWithLease ? '-with-lease' : ''}`,
											detail: `将强制推送${useForceWithLease ? '（带 lease）' : ''} ${
												branch?.state.ahead ? ` ${branch.state.ahead} 次提交` : ''
											}${branch.getRemoteName() ? ` 到 ${branch.getRemoteName()}` : ''}${
												branch != null && branch.state.behind > 0
													? `，覆盖 ${branch.state.behind} 次提交${
															branch?.getRemoteName()
																? `（位于 ${branch.getRemoteName()}）`
																: ''
													  }`
													: ''
											}`,
										}),
								  ]
								: [],
							DirectiveQuickPickItem.create(Directive.Cancel, true, {
								label: `取消${this.title}`,
								detail: `无法推送；${GitReference.toString(branch)} 落后于 ${branch.getRemoteName()} ${branch.state.behind} 次提交`,
							}),
						);
					} else if (branch != null && branch?.state.ahead > 0) {
						step = this.createConfirmStep(appendReposToTitle(`确认${context.title}`, state, context), [
							FlagsQuickPickItem.create<Flags>(state.flags, [branch.getRemoteName()!], {
								label: this.title,
								detail: `将把 ${branch.state.ahead} 次提交从 ${GitReference.toString(branch)} 推送到 ${branch.getRemoteName()}`,
							}),
						]);
					} else {
						step = this.createConfirmStep(
							appendReposToTitle(`确认${context.title}`, state, context),
							[],
							DirectiveQuickPickItem.create(Directive.Cancel, true, {
								label: `取消${this.title}`,
								detail: '没有可推送的提交',
							}),
						);
					}
				}
			} else {
				const status = await repo.getStatus();

				const branch: GitBranchReference = {
					refType: 'branch',
					name: status?.branch ?? 'HEAD',
					ref: status?.branch ?? 'HEAD',
					remote: false,
					repoPath: repo.path,
				};

				if (status?.state.ahead === 0) {
					if (state.reference == null && status.upstream == null) {
						state.reference = branch;

						for (const remote of await repo.getRemotes()) {
							items.push(
								FlagsQuickPickItem.create<Flags>(
									state.flags,
									['--set-upstream', remote.name, status.branch],
									{
										label: `将 ${branch.name} 发布到 ${remote.name}`,
										detail: `将把 ${GitReference.toString(branch)} 发布到 ${remote.name}`,
									},
								),
							);
						}
					}

					if (items.length) {
						step = this.createConfirmStep(
							appendReposToTitle('确认发布', state, context),
							items,
							undefined,
							{ placeholder: '确认发布' },
						);
					} else if (status.upstream == null) {
						step = this.createConfirmStep(
							appendReposToTitle('确认发布', state, context),
							[],
							DirectiveQuickPickItem.create(Directive.Cancel, true, {
								label: '取消发布',
								detail: '无法发布；未找到远程',
							}),
							{ placeholder: '确认发布' },
						);
					} else {
						step = this.createConfirmStep(
							appendReposToTitle('确认推送', state, context),
							[],
							DirectiveQuickPickItem.create(Directive.Cancel, true, {
								label: `取消${this.title}`,
								detail: `无法推送；没有领先于 ${GitBranch.getRemote(status.upstream)} 的提交`,
							}),
						);
					}
				} else {
					let lastFetchedOn = '';

					const lastFetched = await repo.getLastFetched();
					if (lastFetched !== 0) {
						lastFetchedOn = `${pad(GlyphChars.Dot, 2, 2)}上次抓取 ${fromNow(new Date(lastFetched))}`;
					}

					let pushDetails;
					if (state.reference != null) {
						pushDetails = `${
							status?.state.ahead
								? ` 直到并包含 ${GitReference.toString(state.reference, {
										label: false,
								  })}`
								: ''
						}${status?.upstream ? ` 到 ${GitBranch.getRemote(status.upstream)}` : ''}`;
					} else {
						pushDetails = `${status?.state.ahead ? ` ${status.state.ahead} 次提交` : ''}${
							status?.upstream ? ` 到 ${GitBranch.getRemote(status.upstream)}` : ''
						}`;
					}

					step = this.createConfirmStep(
						appendReposToTitle(`确认${context.title}`, state, context, lastFetchedOn),
						[
							...(status?.state.behind
								? []
								: [
										FlagsQuickPickItem.create<Flags>(state.flags, [], {
											label: this.title,
											detail: `将推送${pushDetails}`,
										}),
								  ]),
							FlagsQuickPickItem.create<Flags>(state.flags, ['--force'], {
								label: `强制${this.title}${useForceWithLease ? '（带 lease）' : ''}`,
								description: `--force${useForceWithLease ? '-with-lease' : ''}`,
								detail: `将强制推送${useForceWithLease ? '（带 lease）' : ''} ${pushDetails}${
									status != null && status.state.behind > 0
										? `，覆盖 ${status.state.behind} 次提交${
												status?.upstream ? `（位于 ${GitBranch.getRemote(status.upstream)}）` : ''
										  }`
										: ''
								}`,
							}),
						],
						status?.state.behind
							? DirectiveQuickPickItem.create(Directive.Cancel, true, {
									label: `取消${this.title}`,
									detail: `无法推送；${GitReference.toString(branch)} 落后于${
										status?.upstream ? ` ${GitBranch.getRemote(status.upstream)}` : ''
									} ${status.state.behind} 次提交`,
							  })
							: undefined,
					);

					step.additionalButtons = [QuickCommandButtons.Fetch];
					step.onDidClickButton = async (quickpick, button) => {
						if (button !== QuickCommandButtons.Fetch || quickpick.busy) return false;

						quickpick.title = `确认${context.title}${pad(GlyphChars.Dot, 2, 2)}正在抓取${
							GlyphChars.Ellipsis
						}`;

						quickpick.busy = true;
						quickpick.enabled = false;
						try {
							await repo.fetch({ progress: true });
							// Signal that the step should be retried
							return true;
						} finally {
							quickpick.busy = false;
							quickpick.enabled = true;
						}
					};
				}
			}
		}

		const selection: StepSelection<typeof step> = yield step;
		return QuickCommand.canPickStepContinue(step, state, selection) ? selection[0].item : StepResult.Break;
	}
}
