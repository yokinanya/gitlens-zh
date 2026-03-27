import { Commands } from '../../constants';
import type { Container } from '../../container';
import { WebviewWithConfigBase } from '../webviewWithConfigBase';
import type { State } from './protocol';

export class WelcomeWebview extends WebviewWithConfigBase<State> {
	constructor(container: Container) {
		super(
			container,
			'gitlens.welcome',
			'welcome.html',
			'images/gitlens-icon.png',
			'欢迎使用 GitLens',
			Commands.ShowWelcomePage,
		);
	}

	protected override includeBootstrap(): State {
		return {
			config: this.container.config,
		};
	}
}
