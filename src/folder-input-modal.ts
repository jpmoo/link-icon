import { Modal, App, FuzzySuggestModal, FuzzyMatch, TFolder } from "obsidian";

export class FolderInputModal extends Modal {
	private folderPath: string = "";
	private onConfirm: (folderPath: string) => void;

	constructor(app: App, onConfirm: (folderPath: string) => void) {
		super(app);
		this.onConfirm = onConfirm;
	}

	onOpen() {
		// Use Obsidian's FuzzySuggestModal for autocomplete
		const folders = this.app.vault.getAllFolders();
		const folderPaths = ["", ...folders.map(f => f.path).sort()]; // Add empty string for root
		
		new FolderSuggestModal(this.app, folderPaths, (selectedPath) => {
			this.folderPath = selectedPath;
			this.onConfirm(this.folderPath);
			this.close();
		}).open();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class FolderSuggestModal extends FuzzySuggestModal<string> {
	private items: string[];
	private onSelect: (item: string) => void;

	constructor(app: App, items: string[], onSelect: (item: string) => void) {
		super(app);
		this.items = items;
		this.onSelect = onSelect;
	}

	getItems(): string[] {
		return this.items;
	}

	getItemText(item: string): string {
		if (item === "") {
			return "Root folder (empty path)";
		}
		return item;
	}

	onChooseItem(item: string, evt: MouseEvent | KeyboardEvent): void {
		this.onSelect(item);
	}

	renderSuggestion(item: FuzzyMatch<string>, el: HTMLElement): void {
		const path = item.item;
		if (path === "") {
			el.createEl("div", { text: "Root folder" });
			el.createEl("small", { text: "Empty path" });
		} else {
			el.createEl("div", { text: path });
			const folder = this.app.vault.getAbstractFileByPath(path);
			if (folder && folder instanceof TFolder) {
				el.createEl("small", { text: `Folder (${folder.children.length} items)` });
			}
		}
	}
}

