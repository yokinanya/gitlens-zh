import { ConfigurationTarget, MessageItem, window } from 'vscode';
import { configuration } from './configuration';
import { Commands } from './constants';
import { GitCommit } from './git/models';
import { Logger } from './logger';
import { executeCommand } from './system/command';

export const enum SuppressedMessages {
	CommitHasNoPreviousCommitWarning = 'suppressCommitHasNoPreviousCommitWarning',
	CommitNotFoundWarning = 'suppressCommitNotFoundWarning',
	CreatePullRequestPrompt = 'suppressCreatePullRequestPrompt',
	SuppressDebugLoggingWarning = 'suppressDebugLoggingWarning',
	FileNotUnderSourceControlWarning = 'suppressFileNotUnderSourceControlWarning',
	GitDisabledWarning = 'suppressGitDisabledWarning',
	GitMissingWarning = 'suppressGitMissingWarning',
	GitVersionWarning = 'suppressGitVersionWarning',
	LineUncommittedWarning = 'suppressLineUncommittedWarning',
	NoRepositoryWarning = 'suppressNoRepositoryWarning',
	RebaseSwitchToTextWarning = 'suppressRebaseSwitchToTextWarning',
}

export class Messages {
	static showCommitHasNoPreviousCommitWarningMessage(commit?: GitCommit): Promise<MessageItem | undefined> {
		if (commit == null) {
			return Messages.showMessage('info', '没有上一个提交。', SuppressedMessages.CommitHasNoPreviousCommitWarning);
		}
		return Messages.showMessage(
			'info',
			`提交 ${commit.shortSha}（${commit.author.name}，${commit.formattedDate}）没有上一个提交。`,
			SuppressedMessages.CommitHasNoPreviousCommitWarning,
		);
	}

	static showCommitNotFoundWarningMessage(message: string): Promise<MessageItem | undefined> {
		return Messages.showMessage('warn', `${message}。未找到该提交。`, SuppressedMessages.CommitNotFoundWarning);
	}

	static async showCreatePullRequestPrompt(branch: string): Promise<boolean> {
		const create = { title: '创建拉取请求...' };
		const result = await Messages.showMessage(
			'info',
			`是否要为分支“${branch}”创建拉取请求？`,
			SuppressedMessages.CreatePullRequestPrompt,
			{ title: '不再显示' },
			create,
		);
		return result === create;
	}

	static async showDebugLoggingWarningMessage(): Promise<boolean> {
		const disable = { title: '禁用调试日志' };
		const result = await Messages.showMessage(
			'warn',
			'GitLens 调试日志当前已启用。除非你正在上报问题，否则建议将其关闭。是否要禁用？',
			SuppressedMessages.SuppressDebugLoggingWarning,
			{ title: '不再显示' },
			disable,
		);

		return result === disable;
	}

	static async showGenericErrorMessage(message: string): Promise<MessageItem | undefined> {
		const actions: MessageItem[] = [{ title: '打开输出通道' }];
		const result = await Messages.showMessage(
			'error',
			`${message}。更多详情请查看输出通道。`,
			undefined,
			null,
			...actions,
		);

		if (result !== undefined) {
			Logger.showOutputChannel();
		}
		return result;
	}

	static showFileNotUnderSourceControlWarningMessage(message: string): Promise<MessageItem | undefined> {
		return Messages.showMessage(
			'warn',
			`${message}。该文件可能未受版本控制。`,
			SuppressedMessages.FileNotUnderSourceControlWarning,
		);
	}

	static showGitDisabledErrorMessage() {
		return Messages.showMessage(
			'error',
			'GitLens 需要启用 Git。请重新启用 Git，将 `git.enabled` 设为 true 后重新加载。',
			SuppressedMessages.GitDisabledWarning,
		);
	}

	static showGitInvalidConfigErrorMessage() {
		return Messages.showMessage(
			'error',
			'GitLens 无法使用 Git。你的 Git 配置似乎无效。请修复配置问题后重新加载。',
		);
	}

	static showGitMissingErrorMessage() {
		return Messages.showMessage(
			'error',
			"GitLens 未能找到 Git。请确认已安装 Git，并确保 Git 已加入 PATH，或将 'git.path' 指向其安装位置。",
			SuppressedMessages.GitMissingWarning,
		);
	}

	static showGitVersionUnsupportedErrorMessage(version: string, required: string): Promise<MessageItem | undefined> {
		return Messages.showMessage(
			'error',
			`GitLens 需要比当前已安装版本（${version}）更新的 Git（>= ${required}）。请安装更新版本的 Git。`,
			SuppressedMessages.GitVersionWarning,
		);
	}

	static showInsidersErrorMessage() {
		return Messages.showMessage(
			'error',
			'启用 GitLens 的同时无法使用 GitLens（Insiders）。请确保只启用其中一个版本。',
			SuppressedMessages.GitDisabledWarning,
		);
	}

	static showLineUncommittedWarningMessage(message: string): Promise<MessageItem | undefined> {
		return Messages.showMessage(
			'warn',
			`${message}。该行存在未提交的更改。`,
			SuppressedMessages.LineUncommittedWarning,
		);
	}

	static showNoRepositoryWarningMessage(message: string): Promise<MessageItem | undefined> {
		return Messages.showMessage('warn', `${message}。未找到仓库。`, SuppressedMessages.NoRepositoryWarning);
	}

	static showRebaseSwitchToTextWarningMessage(): Promise<MessageItem | undefined> {
		return Messages.showMessage(
			'warn',
			'关闭 git-rebase-todo 文件或 Rebase 编辑器中的任意一个都会启动 rebase。',
			SuppressedMessages.RebaseSwitchToTextWarning,
		);
	}

	static async showWhatsNewMessage(version: string) {
		const whatsnew = { title: '查看新功能' };
		const result = await Messages.showMessage(
			'info',
			`GitLens ${version} 已上线，来看看有哪些新功能！`,
			undefined,
			null,
			whatsnew,
		);

		if (result === whatsnew) {
			void (await executeCommand(Commands.ShowWelcomePage));
		}
	}

	private static async showMessage(
		type: 'info' | 'warn' | 'error',
		message: string,
		suppressionKey?: SuppressedMessages,
		dontShowAgain: MessageItem | null = { title: '不再显示' },
		...actions: MessageItem[]
	): Promise<MessageItem | undefined> {
		Logger.log(`ShowMessage(${type}, '${message}', ${suppressionKey}, ${JSON.stringify(dontShowAgain)})`);

		if (suppressionKey !== undefined && configuration.get(`advanced.messages.${suppressionKey}` as const)) {
			Logger.log(
				`ShowMessage(${type}, '${message}', ${suppressionKey}, ${JSON.stringify(dontShowAgain)}) skipped`,
			);
			return undefined;
		}

		if (suppressionKey !== undefined && dontShowAgain !== null) {
			actions.push(dontShowAgain);
		}

		let result: MessageItem | undefined = undefined;
		switch (type) {
			case 'info':
				result = await window.showInformationMessage(message, ...actions);
				break;

			case 'warn':
				result = await window.showWarningMessage(message, ...actions);
				break;

			case 'error':
				result = await window.showErrorMessage(message, ...actions);
				break;
		}

		if ((suppressionKey !== undefined && dontShowAgain === null) || result === dontShowAgain) {
			Logger.log(
				`ShowMessage(${type}, '${message}', ${suppressionKey}, ${JSON.stringify(
					dontShowAgain,
				)}) don't show again requested`,
			);
			await this.suppressedMessage(suppressionKey!);

			if (result === dontShowAgain) return undefined;
		}

		Logger.log(
			`ShowMessage(${type}, '${message}', ${suppressionKey}, ${JSON.stringify(dontShowAgain)}) returned ${
				result != null ? result.title : result
			}`,
		);
		return result;
	}

	private static suppressedMessage(suppressionKey: SuppressedMessages) {
		const messages = { ...configuration.get('advanced.messages') };

		messages[suppressionKey] = true;

		for (const [key, value] of Object.entries(messages)) {
			if (value !== true) {
				delete messages[key as keyof typeof messages];
			}
		}

		return configuration.update('advanced.messages', messages, ConfigurationTarget.Global);
	}
}
