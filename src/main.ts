import {
	App,
	Editor,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFolder,
	TFile,
	setIcon
} from 'obsidian';

interface ToolkitPluginSettings {
	isHidden: boolean;
	autoOpenWolaiFolders: boolean;
	showQuickCreateButton: boolean;
	showQuickCreateFolderButton: boolean;
	lockDragAndDrop: boolean;
	defaultFoldLevel: number;
	scaleMermaid: boolean;
	mermaidZoomSensitivity: number;
}

const DEFAULT_SETTINGS: ToolkitPluginSettings = {
	isHidden: true,
	autoOpenWolaiFolders: true,
	showQuickCreateButton: true,
	showQuickCreateFolderButton: true,
	lockDragAndDrop: false,
	defaultFoldLevel: 1,
	scaleMermaid: true,
	mermaidZoomSensitivity: 1.0
}

export default class ToolkitPlugin extends Plugin {
	settings: ToolkitPluginSettings = DEFAULT_SETTINGS;
	private lockRibbonEl: HTMLElement | null = null;
	private foldRibbonEl: HTMLElement | null = null;

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

		// Add Ribbon Icon for One-Click Folding
		this.foldRibbonEl = this.addRibbonIcon(
			'chevrons-down-up',
			'Fold All H1 Headings',
			(evt: MouseEvent) => {
				this.foldHeadingsByLevel(this.settings.defaultFoldLevel);
			}
		);

		// Apply initial states
		this.refreshDragLock();
		this.refreshVisibility();
		this.refreshMermaidScaling();

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

		this.addCommand({
			id: 'fold-all-h1',
			name: 'Fold All H1 Headings',
			callback: () => {
				this.foldHeadingsByLevel(1);
			}
		});

		this.addCommand({
			id: 'fold-all-h2',
			name: 'Fold All H2 Headings',
			callback: () => {
				this.foldHeadingsByLevel(2);
			}
		});

		this.addCommand({
			id: 'fold-all-h3',
			name: 'Fold All H3 Headings',
			callback: () => {
				this.foldHeadingsByLevel(3);
			}
		});

		this.addCommand({
			id: 'collapse-all-headings',
			name: 'Collapse All Headings (Native)',
			callback: () => {
				(this.app as any).commands.executeCommandById('editor:fold-all');
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
		this.addSettingTab(new ToolkitSettingTab(this.app, this));

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

		// Periodically check and inject Mermaid zoom controls
		this.registerInterval(window.setInterval(() => this.injectMermaidZoomControls(), 1000));

		// Add Editor Menu (Right-click) integration
		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu, editor, view) => {
				menu.addItem((item) => {
					item
						.setTitle('Fold All H1 Headings')
						.setIcon('chevrons-down-up')
						.onClick(() => {
							this.foldHeadingsByLevel(1);
						});
				});
			})
		);
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

	injectMermaidZoomControls() {
		if (!this.settings.scaleMermaid) return;

		const mermaidDivs = document.querySelectorAll('.mermaid:not(.has-toolkit-zoom)');
		mermaidDivs.forEach(el => {
			const mermaidEl = el as HTMLElement;
			mermaidEl.addClass('has-toolkit-zoom');

			const controls = mermaidEl.createEl('div', { cls: 'toolkit-zoom-controls' });

			const zoomOut = controls.createEl('div', { cls: 'toolkit-zoom-icon', attr: { 'aria-label': 'Zoom Out' } });
			setIcon(zoomOut, 'minus');
			zoomOut.onClickEvent(() => this.updateMermaidZoom(mermaidEl, -0.1));

			const reset = controls.createEl('div', { cls: 'toolkit-zoom-icon', attr: { 'aria-label': 'Reset Zoom' } });
			setIcon(reset, 'refresh-ccw');
			reset.onClickEvent(() => this.updateMermaidZoom(mermaidEl, 0, true));

			const zoomIn = controls.createEl('div', { cls: 'toolkit-zoom-icon', attr: { 'aria-label': 'Zoom In' } });
			setIcon(zoomIn, 'plus');
			zoomIn.onClickEvent(() => this.updateMermaidZoom(mermaidEl, 0.1));

			const expand = controls.createEl('div', { cls: 'toolkit-zoom-icon', attr: { 'aria-label': 'Fullscreen' } });
			setIcon(expand, 'maximize');
			expand.onClickEvent(() => {
				const svg = mermaidEl.querySelector('svg');
				if (svg) {
					new MermaidModal(this.app, svg.cloneNode(true) as SVGElement, this.settings.mermaidZoomSensitivity).open();
				}
			});

			// Reset on leave as requested ("离开就恢复")
			mermaidEl.addEventListener('mouseleave', () => {
				this.updateMermaidZoom(mermaidEl, 0, true);
			});
		});
	}

	updateMermaidZoom(el: HTMLElement, delta: number, reset = false) {
		const svg = el.querySelector('svg');
		if (!svg) return;

		let currentScale = parseFloat(el.getAttr('data-zoom') || '1.0');
		if (reset) {
			currentScale = 1.0;
		} else {
			currentScale = Math.max(0.1, Math.min(5.0, currentScale + delta));
		}

		el.setAttr('data-zoom', currentScale.toString());
		svg.style.transform = `scale(${currentScale})`;
		svg.style.transformOrigin = 'top center';

		// If zoomed in, allow overflow and scrolling
		if (currentScale > 1.0) {
			el.style.overflowX = 'auto';
		} else {
			el.style.overflowX = 'hidden';
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
			const leaf = this.app.workspace.getLeaf(false);
			leaf.openFile(file);
		}
	}

	foldHeadingsByLevel(level: number) {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			return;
		}

		const editor = view.editor;
		const file = view.file;
		if (!file) return;

		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache || !cache.headings) {
			return;
		}

		const cursor = editor.getCursor();
		let found = false;

		// Unfold everything first to ensure a consistent state?
		// Actually, let's just try to fold.

		for (const heading of cache.headings) {
			if (heading.level === level) {
				const line = heading.position.start.line;
				editor.setCursor(line, 0);
				// 'editor:toggle-fold' will fold if expanded, and unfold if collapsed
				(this.app as any).commands.executeCommandById('editor:toggle-fold');
				found = true;
			}
		}

		// Restore original cursor position
		editor.setCursor(cursor);
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

	refreshMermaidScaling() {
		if (this.settings.scaleMermaid) {
			document.body.classList.add('toolkit-scale-mermaid');
		} else {
			document.body.classList.remove('toolkit-scale-mermaid');
		}
	}

	onunload() {
		document.body.classList.remove('hide-image-folder', 'is-drag-locked', 'toolkit-scale-mermaid');
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

class MermaidModal extends Modal {
	private scale = 1.0;
	private x = 0;
	private y = 0;
	private isDragging = false;
	private startX = 0;
	private startY = 0;
	private container!: HTMLDivElement;

	constructor(app: App, private svg: SVGElement, private sensitivity: number) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		this.titleEl.setText('Mermaid Diagram Viewer');

		contentEl.addClass('toolkit-mermaid-modal-content');

		// Remove scaling styles from clone
		this.svg.removeAttribute('width');
		this.svg.removeAttribute('height');
		this.svg.style.transform = 'none';
		this.svg.style.maxWidth = 'none';
		this.svg.style.width = 'auto';
		this.svg.style.height = 'auto';
		this.svg.style.transformOrigin = 'center center';

		this.container = contentEl.createEl('div', { cls: 'toolkit-mermaid-modal-container' });
		this.container.appendChild(this.svg);

		this.setupInteraction();
	}

	private setupInteraction() {
		// Wheel Zoom
		this.container.addEventListener('wheel', (e: WheelEvent) => {
			e.preventDefault();
			
			// Handle pinch zoom (ctrlKey is true for pinch on trackpads)
			const delta = -e.deltaY;
			// Refined sensitivity: 0.001 is a good base for trackpad deltas
			const speed = 0.001 * this.sensitivity; 
			const factor = Math.exp(delta * speed);
			const newScale = this.scale * factor;
			
			// Min/Max Scale
			this.scale = Math.max(0.1, Math.min(20, newScale));
			this.updateTransform();
		}, { passive: false });

		// Drag Pan
		this.container.addEventListener('pointerdown', (e: PointerEvent) => {
			this.isDragging = true;
			this.startX = e.clientX - this.x;
			this.startY = e.clientY - this.y;
			this.container.setPointerCapture(e.pointerId);
			this.container.addClass('is-grabbing');
		});

		this.container.addEventListener('pointermove', (e: PointerEvent) => {
			if (!this.isDragging) return;
			this.x = e.clientX - this.startX;
			this.y = e.clientY - this.startY;
			this.updateTransform();
		});

		this.container.addEventListener('pointerup', (e: PointerEvent) => {
			this.isDragging = false;
			this.container.releasePointerCapture(e.pointerId);
			this.container.removeClass('is-grabbing');
		});
	}

	private updateTransform() {
		if (this.svg) {
			this.svg.style.transform = `translate(${this.x}px, ${this.y}px) scale(${this.scale})`;
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class ToolkitSettingTab extends PluginSettingTab {
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

		new Setting(containerEl)
			.setName('Default Ribbon Fold Level')
			.setDesc('Determines which heading level the ribbon icon should fold.')
			.addSlider(slider => slider
				.setLimits(1, 6, 1)
				.setValue(this.plugin.settings.defaultFoldLevel)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.defaultFoldLevel = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Scale Mermaid Diagrams')
			.setDesc('Conform Mermaid diagrams to the note width (prevents them from being too large).')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.scaleMermaid)
				.onChange(async (value) => {
					this.plugin.settings.scaleMermaid = value;
					await this.plugin.saveSettings();
					this.plugin.refreshMermaidScaling();
				}));

		new Setting(containerEl)
			.setName('Mermaid Zoom Sensitivity')
			.setDesc('Adjust how fast Mermaid diagrams scale with your wheel/pinch gesture (Default: 1.0).')
			.addSlider(slider => slider
				.setLimits(0.1, 2.0, 0.1)
				.setValue(this.plugin.settings.mermaidZoomSensitivity)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.mermaidZoomSensitivity = value;
					await this.plugin.saveSettings();
				}));
	}
}
