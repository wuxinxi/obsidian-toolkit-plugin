import { App, Plugin, PluginSettingTab, Setting, Notice, TFolder, TFile, setIcon } from 'obsidian';

interface ToolkitPluginSettings {
	isHidden: boolean;
	autoOpenWolaiFolders: boolean;
	showQuickCreateButton: boolean;
	showQuickCreateFolderButton: boolean;
	lockDragAndDrop: boolean;
}

const DEFAULT_SETTINGS: ToolkitPluginSettings = {
	isHidden: true,
	autoOpenWolaiFolders: true,
	showQuickCreateButton: true,
	showQuickCreateFolderButton: true,
	lockDragAndDrop: false
}

export default class ToolkitPlugin extends Plugin {
	settings: ToolkitPluginSettings = DEFAULT_SETTINGS;
	private lockRibbonEl: HTMLElement | null = null;

	async onload() {
		await this.loadSettings();

		// Add Ribbon Icon for Toggling Image Folders
		this.addRibbonIcon('image-off', 'Toggle Image Folders', (evt: MouseEvent) => {
			this.toggleVisibility();
		});

		// Add Ribbon Icon for Toggling Drag-and-Drop Lock
		this.lockRibbonEl = this.addRibbonIcon(
			this.settings.lockDragAndDrop ? 'lock' : 'unlock',
			'Toggle Drag-and-Drop Lock',
			(evt: MouseEvent) => {
				this.toggleDragLock();
			}
		);

		// Apply initial drag lock state
		this.refreshDragLock();

		// Add Command Palette items
		this.addCommand({
			id: 'toggle-image-folder-visibility',
			name: 'Toggle Image Folder Visibility',
			callback: () => {
				this.toggleVisibility();
			}
		});

		this.addCommand({
			id: 'toggle-drag-lock',
			name: 'Toggle File Explorer Drag-and-Drop Lock',
			callback: () => {
				this.toggleDragLock();
			}
		});

		// Intercept dragstart events to prevent accidental moves
		this.registerDomEvent(document, 'dragstart', (evt: DragEvent) => {
			if (this.settings.lockDragAndDrop) {
				const target = evt.target as HTMLElement;
				// Check if the drag is coming from the file explorer
				if (target.closest('.nav-file') || target.closest('.nav-folder')) {
					evt.preventDefault();
					new Notice('File drag-and-drop is locked by ToolkitPlugin.');
				}
			}
		}, true);

		// Add Settings Tab
		this.addSettingTab(new ToolkitPluginSettingTab(this.app, this));

		// Apply initial CSS state
		this.refreshVisibility();

		// Listen for auto-open (regular click on folder name)
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			if (!this.settings.autoOpenWolaiFolders) return;

			const target = evt.target as HTMLElement;
			
			// Ignore if clicking the action icons (handled locally on the element)
			if (target.closest('.toolkit-icons-container') || target.closest('.toolkit-action-icon')) return;

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
		if (!this.settings.showQuickCreateButton && !this.settings.showQuickCreateFolderButton) return;

		const folderTitles = document.querySelectorAll('.nav-folder-title:not(.has-toolkit-icons)');
		folderTitles.forEach(el => {
			const folderTitleEl = el as HTMLElement;
			folderTitleEl.addClass('has-toolkit-icons');

			const container = folderTitleEl.createEl('div', { cls: 'toolkit-icons-container' });

			if (this.settings.showQuickCreateFolderButton) {
				const folderIconContainer = container.createEl('div', { cls: 'toolkit-action-icon toolkit-folder-icon' });
				setIcon(folderIconContainer, 'folder-plus');
				folderIconContainer.setAttr('aria-label', 'New folder');

				this.attachCreateListener(folderIconContainer, folderTitleEl, 'folder');
			}

			if (this.settings.showQuickCreateButton) {
				const noteIconContainer = container.createEl('div', { cls: 'toolkit-action-icon toolkit-note-icon' });
				setIcon(noteIconContainer, 'plus-with-circle');
				noteIconContainer.setAttr('aria-label', 'New note');

				this.attachCreateListener(noteIconContainer, folderTitleEl, 'note');
			}
		});
	}

	attachCreateListener(iconEl: HTMLElement, folderTitleEl: HTMLElement, type: 'note' | 'folder') {
		['mousedown', 'mouseup', 'click', 'pointerdown', 'pointerup'].forEach(eventType => {
			iconEl.addEventListener(eventType, (evt: any) => {
				evt.stopPropagation();
				evt.stopImmediatePropagation();
				if (eventType === 'mousedown' || eventType === 'click') evt.preventDefault();

				// Trigger creation ONLY on mousedown
				if (eventType === 'mousedown' && evt.button === 0) {
					const path = folderTitleEl.getAttr('data-path');
					if (path) {
						const folder = this.app.vault.getAbstractFileByPath(path);
						if (folder instanceof TFolder) {
							if (type === 'note') {
								this.handleQuickCreate(folder, path);
							} else {
								this.handleQuickCreateFolder(folder, path);
							}
						}
					}
				}
			}, true);
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

	async handleQuickCreateFolder(folder: TFolder, path: string) {
		try {
			// 1. Hard Expand: Programmatically set to expanded
			const explorerLeaves = this.app.workspace.getLeavesOfType('file-explorer');
			explorerLeaves.forEach(leaf => {
				const view = leaf.view as any;
				if (view.fileItems && view.fileItems[path]) {
					view.fileItems[path].setCollapsed(false);
				}
			});

			// 2. Create the folder "未命名" (handle naming conflicts similar to native Obsidian)
			let newFolderName = "未命名";
			let counter = 1;
			let newFolderPath = `${path}/${newFolderName}`;
			
			while (this.app.vault.getAbstractFileByPath(newFolderPath)) {
				newFolderName = `未命名 ${counter}`;
				newFolderPath = `${path}/${newFolderName}`;
				counter++;
			}

			const newFolder = await this.app.vault.createFolder(newFolderPath);

			// 3. Attempt to trigger the native rename behavior.
			// The native file explorer view has a tree structure where we can trigger renaming.
			if (newFolder) {
				setTimeout(() => {
					explorerLeaves.forEach(leaf => {
						const view = leaf.view as any;
						if (view.revealFile) {
							// Forcing UI to show the new folder
							view.revealFile(newFolder).then(() => {
								if (view.fileItems && view.fileItems[newFolderPath]) {
									// Try to trigger the rename action on the newly created folder item
									const folderItem = view.fileItems[newFolderPath];
									if (folderItem.setRename) {
										folderItem.setRename(true);
									} else {
										// Fallback if setRename is unavailable, perhaps selecting the name element and calling focus
										const titleEl = folderItem.titleInnerEl as HTMLElement;
										if (titleEl) {
											const evt = new MouseEvent('click', { detail: 1 });
											titleEl.dispatchEvent(evt); // sometimes native double click or specific internal action is needed
										}
									}
								}
							});
						}
					});
				}, 100); // Slight delay to ensure DOM is updated after folder creation
			}
		} catch (e) {
			console.error('toolkitPlusin: Quick create folder failed', e);
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

	async toggleDragLock() {
		this.settings.lockDragAndDrop = !this.settings.lockDragAndDrop;
		await this.saveSettings();
		this.refreshDragLock();
		
		const status = this.settings.lockDragAndDrop ? 'Locked' : 'Unlocked';
		new Notice(`File drag-and-drop is now ${status}`);
	}

	refreshDragLock() {
		// Update Ribbon Icon
		if (this.lockRibbonEl) {
			setIcon(this.lockRibbonEl, this.settings.lockDragAndDrop ? 'lock' : 'unlock');
		}

		// Update Body Class for CSS-based feedback if needed
		if (this.settings.lockDragAndDrop) {
			document.body.classList.add('is-drag-locked');
		} else {
			document.body.classList.remove('is-drag-locked');
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
		document.body.classList.remove('hide-image-folder', 'is-drag-locked');
		// Remove all injected buttons and classes
		document.querySelectorAll('.toolkit-icons-container').forEach(el => el.remove());
		document.querySelectorAll('.has-toolkit-icons').forEach(el => el.classList.remove('has-toolkit-icons'));
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
					
					// Re-inject buttons to reflect changes
					document.querySelectorAll('.toolkit-icons-container').forEach(el => el.remove());
					document.querySelectorAll('.has-toolkit-icons').forEach(el => el.classList.remove('has-toolkit-icons'));
					this.plugin.injectCreateButtons();
				}));

		new Setting(containerEl)
			.setName('Show Quick Create Folder Button')
			.setDesc('Show a folder icon on folders to quickly create a new folder.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showQuickCreateFolderButton)
				.onChange(async (value) => {
					this.plugin.settings.showQuickCreateFolderButton = value;
					await this.plugin.saveSettings();
					
					// Re-inject buttons to reflect changes
					document.querySelectorAll('.toolkit-icons-container').forEach(el => el.remove());
					document.querySelectorAll('.has-toolkit-icons').forEach(el => el.classList.remove('has-toolkit-icons'));
					this.plugin.injectCreateButtons();
				}));

		new Setting(containerEl)
			.setName('Lock File Explorer Drag-and-Drop')
			.setDesc('Prevent accidental moving of files and folders in the file explorer.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.lockDragAndDrop)
				.onChange(async (value) => {
					this.plugin.settings.lockDragAndDrop = value;
					await this.plugin.saveSettings();
					this.plugin.refreshDragLock();
				}));
	}
}
