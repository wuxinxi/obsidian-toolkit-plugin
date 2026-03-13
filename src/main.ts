import { App, Plugin, PluginSettingTab, Setting, Notice, TFolder, TFile, setIcon } from 'obsidian';

interface ToolkitPluginSettings {
	isHidden: boolean;
	autoOpenWolaiFolders: boolean;
	showQuickCreateButton: boolean;
}

const DEFAULT_SETTINGS: ToolkitPluginSettings = {
	isHidden: true,
	autoOpenWolaiFolders: true,
	showQuickCreateButton: true
}

export default class ToolkitPlugin extends Plugin {
	settings: ToolkitPluginSettings = DEFAULT_SETTINGS;

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
		this.addSettingTab(new ToolkitPluginSettingTab(this.app, this));

		// Apply initial CSS state
		this.refreshVisibility();

		// Listen for auto-open (regular click on folder name)
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			if (!this.settings.autoOpenWolaiFolders) return;

			const target = evt.target as HTMLElement;
			
			// Ignore if clicking the plus icon (handled locally on the element)
			if (target.closest('.toolkit-plus-icon')) return;

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

		// Periodically check and inject buttons
		this.registerInterval(window.setInterval(() => this.injectCreateButtons(), 1000));
	}

	injectCreateButtons() {
		if (!this.settings.showQuickCreateButton) return;

		const folderTitles = document.querySelectorAll('.nav-folder-title:not(.has-toolkit-icon)');
		folderTitles.forEach(el => {
			const folderTitleEl = el as HTMLElement;
			folderTitleEl.addClass('has-toolkit-icon');

			const iconContainer = folderTitleEl.createEl('div', { cls: 'toolkit-plus-icon' });
			setIcon(iconContainer, 'plus-with-circle');
			iconContainer.setAttr('aria-label', 'New note');

			// Aggressive blocking on the icon itself
			['mousedown', 'mouseup', 'click', 'pointerdown', 'pointerup'].forEach(type => {
				iconContainer.addEventListener(type, (evt: any) => {
					evt.stopPropagation();
					evt.stopImmediatePropagation();
					if (type === 'mousedown' || type === 'click') evt.preventDefault();

					// Trigger creation ONLY on mousedown
					if (type === 'mousedown' && evt.button === 0) {
						const path = folderTitleEl.getAttr('data-path');
						if (path) {
							const folder = this.app.vault.getAbstractFileByPath(path);
							if (folder instanceof TFolder) {
								this.handleQuickCreate(folder, path);
							}
						}
					}
				}, true);
			});
		});
	}

	async handleQuickCreate(folder: TFolder, path: string) {
		const appAny = this.app as any;

		try {
			// 1. Hard Expand: Programmatically set to expanded
			const explorerLeaves = this.app.workspace.getLeavesOfType('file-explorer');
			explorerLeaves.forEach(leaf => {
				const view = leaf.view as any;
				if (view.fileItems && view.fileItems[path]) {
					view.fileItems[path].setCollapsed(false);
				}
			});

			// 2. Create the file
			const fileManagerAny = this.app.fileManager as any;
			let newFile: TFile;
			if (typeof fileManagerAny.createNewMarkdownFile === 'function') {
				newFile = await fileManagerAny.createNewMarkdownFile(folder);
			} else {
				newFile = await this.app.vault.create(`${path}/Untitled.md`, '');
			}

			if (newFile) {
				// 3. Open and Reveal (Reveal forces UI expansion)
				await this.app.workspace.getLeaf(false).openFile(newFile);
				explorerLeaves.forEach(leaf => {
					if ((leaf.view as any).revealFile) {
						(leaf.view as any).revealFile(newFile);
					}
				});
			}
		} catch (e) {
			console.error('toolkitPlusin: Quick create failed', e);
		}
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
		// Remove all injected buttons and classes
		document.querySelectorAll('.toolkit-plus-icon').forEach(el => el.remove());
		document.querySelectorAll('.has-toolkit-icon').forEach(el => el.classList.remove('has-toolkit-icon'));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class ToolkitPluginSettingTab extends PluginSettingTab {
	plugin: ToolkitPlugin;

	constructor(app: App, plugin: ToolkitPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'ToolkitPlugin Settings' });

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

		new Setting(containerEl)
			.setName('Show Quick Create Button')
			.setDesc('Show a "+" icon on folders to quickly create a new note.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showQuickCreateButton)
				.onChange(async (value) => {
					this.plugin.settings.showQuickCreateButton = value;
					await this.plugin.saveSettings();
					if (!value) {
						document.querySelectorAll('.toolkit-plus-icon').forEach(el => el.remove());
					} else {
						this.plugin.injectCreateButtons();
					}
				}));
	}
}
