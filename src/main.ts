import { App, Plugin, PluginSettingTab, Setting, Notice, TFolder, TFile } from 'obsidian';

interface HideImageSettings {
	isHidden: boolean;
	autoOpenWolaiFolders: boolean;
}

const DEFAULT_SETTINGS: HideImageSettings = {
	isHidden: true,
	autoOpenWolaiFolders: true
}

export default class HideImagePlugin extends Plugin {
	settings: HideImageSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();

		// Add Ribbon Icon for Toggling Image Folders
		this.addRibbonIcon('image-off', 'Toggle Image Folders', (evt: MouseEvent) => {
			this.toggleVisibility();
		});

		// Add Command Palette item
		this.addCommand({
			id: 'toggle-image-folder-visibility',
			name: 'Toggle Image Folder Visibility',
			callback: () => {
				this.toggleVisibility();
			}
		});

		// Add Settings Tab
		this.addSettingTab(new HideImageSettingTab(this.app, this));

		// Apply initial CSS state
		this.refreshVisibility();

		// Listen for click events on the file explorer
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			if (!this.settings.autoOpenWolaiFolders) return;

			const target = evt.target as HTMLElement;
			
			// If clicking the collapse arrow, don't trigger auto-open
			if (target.classList.contains('nav-folder-collapse-indicator') || 
				target.closest('.nav-folder-collapse-indicator')) {
				return;
			}

			const folderTitleEl = target.closest('.nav-folder-title');
			if (folderTitleEl) {
				const path = folderTitleEl.getAttr('data-path');
				if (!path) return;

				const folder = this.app.vault.getAbstractFileByPath(path);
				if (folder instanceof TFolder) {
					this.handleFolderClick(folder);
				}
			}
		});
	}

	async handleFolderClick(folder: TFolder) {
		// Filter out 'image' folders and non-md files
		const children = folder.children.filter(child => {
			if (child instanceof TFolder && child.name.toLowerCase() === 'image') return false;
			return true;
		});

		const mdFiles = children.filter((child): child is TFile => child instanceof TFile && child.extension === 'md');

		// Check if there is exactly one md file and its name matches the folder name
		if (mdFiles.length === 1) {
			const file = mdFiles[0];
			if (file.basename.toLowerCase() === folder.name.toLowerCase()) {
				const leaf = this.app.workspace.getLeaf(false);
				leaf.openFile(file);
			}
		}
	}

	async toggleVisibility() {
		this.settings.isHidden = !this.settings.isHidden;
		await this.saveSettings();
		this.refreshVisibility();
		
		const status = this.settings.isHidden ? 'Hidden' : 'Visible';
		new Notice(`Image folders are now ${status}`);
	}

	refreshVisibility() {
		if (this.settings.isHidden) {
			document.body.classList.add('hide-image-folder');
		} else {
			document.body.classList.remove('hide-image-folder');
		}
	}

	onunload() {
		document.body.classList.remove('hide-image-folder');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class HideImageSettingTab extends PluginSettingTab {
	plugin: HideImagePlugin;

	constructor(app: App, plugin: HideImagePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Hide Image Folder Settings' });

		new Setting(containerEl)
			.setName('Hide Image Folders')
			.setDesc('Hide all folders named "image" in the file explorer.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.isHidden)
				.onChange(async (value) => {
					this.plugin.settings.isHidden = value;
					await this.plugin.saveSettings();
					this.plugin.refreshVisibility();
				}));

		new Setting(containerEl)
			.setName('Auto-open Wolai-style Folders')
			.setDesc('When clicking a folder containing only one MD file with the same name, open the file automatically.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoOpenWolaiFolders)
				.onChange(async (value) => {
					this.plugin.settings.autoOpenWolaiFolders = value;
					await this.plugin.saveSettings();
				}));
	}
}
