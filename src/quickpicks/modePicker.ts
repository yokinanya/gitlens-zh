import { QuickPickItem, window } from 'vscode';
import { GlyphChars } from '../constants';
import { Container } from '../container';

export interface ModesQuickPickItem extends QuickPickItem {
	key: string | undefined;
}

export namespace ModePicker {
	export async function show(): Promise<ModesQuickPickItem | undefined> {
		if (Container.instance.config.modes == null) return undefined;

		const modes = Container.instance.config.modes;
		const modeKeys = Object.keys(modes);
		if (modeKeys.length === 0) return undefined;

		const mode = Container.instance.config.mode.active;

		const items = modeKeys.map(key => {
			const modeCfg = modes[key];
			const item: ModesQuickPickItem = {
				label: `${mode === key ? '$(check)\u00a0\u00a0' : '\u00a0\u00a0\u00a0\u00a0\u00a0'}${
					modeCfg.name
				} 模式`,
				description: modeCfg.description ? `\u00a0${GlyphChars.Dash}\u00a0 ${modeCfg.description}` : '',
				key: key,
			};
			return item;
		});

		if (mode) {
			items.splice(0, 0, {
				label: `退出 ${modes[mode].name} 模式`,
				key: undefined,
			});
		}

		const pick = await window.showQuickPick(items, {
			placeHolder: '选择要进入的 GitLens 模式',
		});

		return pick;
	}
}
