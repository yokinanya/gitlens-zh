import { TreeItem, TreeItemCollapsibleState } from 'vscode';
import { GlyphChars } from '../../constants';
import { GitUri } from '../../git/gitUri';
import { NamedRef } from '../../storage';
import { SearchAndCompareView, SearchAndCompareViewNode } from '../searchAndCompareView';
import { ContextValues, ViewNode } from './viewNode';

interface RepoRef {
	label: string;
	repoPath: string;
	ref: string | NamedRef;
}

export class ComparePickerNode extends ViewNode<SearchAndCompareView> {
	readonly order: number = Date.now();
	readonly pinned: boolean = false;

	constructor(view: SearchAndCompareView, parent: SearchAndCompareViewNode, public readonly selectedRef: RepoRef) {
		super(GitUri.unknown, view, parent);
	}

	get canDismiss(): boolean {
		return true;
	}

	getChildren(): ViewNode[] {
		return [];
	}

	getTreeItem(): TreeItem {
		const selectedRef = this.selectedRef;
		const repoPath = selectedRef?.repoPath;

		let description;
		if (repoPath !== undefined) {
			if (this.view.container.git.repositoryCount > 1) {
				const repo = this.view.container.git.getRepository(repoPath);
				description = repo?.formattedName ?? repoPath;
			}
		}

		let item;
		if (selectedRef == null) {
			item = new TreeItem(
				'比较 <分支、标签或引用> 与 <分支、标签或引用>',
				TreeItemCollapsibleState.None,
			);
			item.contextValue = ContextValues.ComparePicker;
			item.description = description;
			item.tooltip = `点击以选择或输入用于比较的引用${GlyphChars.Ellipsis}`;
			item.command = {
				title: `比较${GlyphChars.Ellipsis}`,
				command: this.view.getQualifiedCommand('selectForCompare'),
			};
		} else {
			item = new TreeItem(
				`比较 ${selectedRef.label} 与 <分支、标签或引用>`,
				TreeItemCollapsibleState.None,
			);
			item.contextValue = ContextValues.ComparePickerWithRef;
			item.description = description;
			item.tooltip = `点击以将 ${selectedRef.label} 与其他引用比较${GlyphChars.Ellipsis}`;
			item.command = {
				title: `比较 ${selectedRef.label} 与${GlyphChars.Ellipsis}`,
				command: this.view.getQualifiedCommand('compareWithSelected'),
			};
		}

		return item;
	}
}
