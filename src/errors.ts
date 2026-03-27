import { Uri } from 'vscode';
import { isSubscriptionPaidPlan, RequiredSubscriptionPlans, Subscription } from './subscription';

export class AccessDeniedError extends Error {
	public readonly subscription: Subscription;
	public readonly required: RequiredSubscriptionPlans | undefined;

	constructor(subscription: Subscription, required: RequiredSubscriptionPlans | undefined) {
		let message;
		if (subscription.account?.verified === false) {
			message = '需要验证邮箱';
		} else if (required != null && isSubscriptionPaidPlan(required)) {
			message = '需要付费订阅';
		} else {
			message = '需要订阅';
		}

		super(message);

		this.subscription = subscription;
		this.required = required;
		Error.captureStackTrace?.(this, AccessDeniedError);
	}
}

export class AccountValidationError extends Error {
	readonly original?: Error;
	readonly statusCode?: number;
	readonly statusText?: string;

	constructor(message: string, original?: Error, statusCode?: number, statusText?: string) {
		message += `; status=${statusCode}: ${statusText}`;
		super(message);

		this.original = original;
		this.statusCode = statusCode;
		this.statusText = statusText;
		Error.captureStackTrace?.(this, AccountValidationError);
	}
}

export const enum AuthenticationErrorReason {
	UserDidNotConsent = 1,
	Unauthorized = 2,
	Forbidden = 3,
}

export class AuthenticationError extends Error {
	readonly id: string;
	readonly original?: Error;
	readonly reason: AuthenticationErrorReason | undefined;

	constructor(id: string, reason?: AuthenticationErrorReason, original?: Error);
	constructor(id: string, message?: string, original?: Error);
	constructor(id: string, messageOrReason: string | AuthenticationErrorReason | undefined, original?: Error) {
		let message;
		let reason: AuthenticationErrorReason | undefined;
		if (messageOrReason == null) {
			message = `无法获取 '${id}' 所需的身份验证会话`;
		} else if (typeof messageOrReason === 'string') {
			message = messageOrReason;
			reason = undefined;
		} else {
			reason = messageOrReason;
			switch (reason) {
				case AuthenticationErrorReason.UserDidNotConsent:
					message = `此操作需要 '${id}' 身份验证`;
					break;
				case AuthenticationErrorReason.Unauthorized:
					message = `你的 '${id}' 凭据无效或已过期`;
					break;
				case AuthenticationErrorReason.Forbidden:
					message = `你的 '${id}' 凭据没有所需的访问权限`;
					break;
			}
		}
		super(message);

		this.id = id;
		this.original = original;
		this.reason = reason;
		Error.captureStackTrace?.(this, AuthenticationError);
	}
}

export class ExtensionNotFoundError extends Error {
	constructor(public readonly extensionId: string, public readonly extensionName: string) {
		super(
			`未找到扩展 ${extensionName}（${extensionId}）。请确认其已安装并启用。`,
		);

		Error.captureStackTrace?.(this, ExtensionNotFoundError);
	}
}

export const enum OpenVirtualRepositoryErrorReason {
	RemoteHubApiNotFound = 1,
	NotAGitHubRepository = 2,
	GitHubAuthenticationNotFound = 3,
	GitHubAuthenticationDenied = 4,
}

export class OpenVirtualRepositoryError extends Error {
	readonly original?: Error;
	readonly reason: OpenVirtualRepositoryErrorReason | undefined;
	readonly repoPath: string;

	constructor(repoPath: string, reason?: OpenVirtualRepositoryErrorReason, original?: Error);
	constructor(repoPath: string, message?: string, original?: Error);
	constructor(
		repoPath: string,
		messageOrReason: string | OpenVirtualRepositoryErrorReason | undefined,
		original?: Error,
	) {
		let message;
		let reason: OpenVirtualRepositoryErrorReason | undefined;
		if (messageOrReason == null) {
			message = `无法打开虚拟仓库：${repoPath}`;
		} else if (typeof messageOrReason === 'string') {
			message = messageOrReason;
			reason = undefined;
		} else {
			reason = messageOrReason;
			message = `无法打开虚拟仓库：${repoPath}；`;
			switch (reason) {
				case OpenVirtualRepositoryErrorReason.RemoteHubApiNotFound:
					message +=
						'无法从 GitHub Repositories 扩展获取所需 API。请确认该扩展已安装并启用';
					break;
				case OpenVirtualRepositoryErrorReason.NotAGitHubRepository:
					message += '目前仅支持 GitHub 仓库';
					break;
				case OpenVirtualRepositoryErrorReason.GitHubAuthenticationNotFound:
					message += '无法获取所需的 GitHub 身份验证';
					break;
				case OpenVirtualRepositoryErrorReason.GitHubAuthenticationDenied:
					message += '需要 GitHub 身份验证';
					break;
			}
		}
		super(message);

		this.original = original;
		this.reason = reason;
		this.repoPath = repoPath;
		Error.captureStackTrace?.(this, OpenVirtualRepositoryError);
	}
}

export class ProviderNotFoundError extends Error {
	constructor(pathOrUri: string | Uri | undefined) {
		super(
			`未为以下对象注册提供程序：'${
				pathOrUri == null
					? String(pathOrUri)
					: typeof pathOrUri === 'string'
					? pathOrUri
					: pathOrUri.toString(true)
			}'`,
		);

		Error.captureStackTrace?.(this, ProviderNotFoundError);
	}
}

export class ProviderRequestClientError extends Error {
	constructor(public readonly original: Error) {
		super(original.message);

		Error.captureStackTrace?.(this, ProviderRequestClientError);
	}
}

export class ProviderRequestNotFoundError extends Error {
	constructor(public readonly original: Error) {
		super(original.message);

		Error.captureStackTrace?.(this, ProviderRequestNotFoundError);
	}
}
