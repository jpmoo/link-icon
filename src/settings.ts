import { App, PluginSettingTab, Setting, Modal, TextComponent } from "obsidian";
import LinkIconPlugin from "../main";
import { IconPickerModal } from "./icon-picker-modal";
import { FolderInputModal } from "./folder-input-modal";

export interface FolderIconMapping {
	icon: string;
	color?: string;
}

export interface LinkIconSettings {
	iconPosition: "before" | "after";
	folderIconMap: Record<string, FolderIconMapping>;
	iconSize: number;
	iconColor: string; // Default/fallback color
}

export const DEFAULT_SETTINGS: LinkIconSettings = {
	iconPosition: "before",
	folderIconMap: {},
	iconSize: 16,
	iconColor: "var(--text-normal)",
}

export class LinkIconSettingTab extends PluginSettingTab {
	plugin: LinkIconPlugin;

	constructor(app: App, plugin: LinkIconPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h2", { text: "Link Icon Settings", cls: "link-icon-settings-title" });

		// Icon position setting
		new Setting(containerEl)
			.setName("Icon position")
			.setDesc("Position of the icon relative to the link")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("before", "Before link")
					.addOption("after", "After link")
					.setValue(this.plugin.settings.iconPosition)
					.onChange(async (value: "before" | "after") => {
						this.plugin.settings.iconPosition = value;
						await this.plugin.saveSettings();
						this.plugin.processAllLinks();
					})
			);

		// Icon size setting
		new Setting(containerEl)
			.setName("Icon size")
			.setDesc("Size of the icon in pixels")
			.addSlider((slider) =>
				slider
					.setLimits(10, 32, 1)
					.setValue(this.plugin.settings.iconSize)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.iconSize = value;
						await this.plugin.saveSettings();
						this.plugin.processAllLinks();
					})
			);

		// Icon color setting (default/fallback)
		new Setting(containerEl)
			.setName("Default icon color")
			.setDesc("Default color for icons (CSS color, hex, or CSS variable). Can be overridden per mapping.")
			.addText((text) => {
				text
					.setPlaceholder("var(--text-normal)")
					.setValue(this.plugin.settings.iconColor)
					.onChange(async (value) => {
						this.plugin.settings.iconColor = value;
						await this.plugin.saveSettings();
						this.plugin.processAllLinks();
					});
				
				// Add color picker button
				const colorInput = text.inputEl.parentElement?.createEl("input", {
					type: "color",
					attr: { 
						style: "width: 40px; height: 30px; margin-left: 8px; cursor: pointer;",
						title: "Pick a color"
					}
				}) as HTMLInputElement;
				
				if (colorInput) {
					// Try to extract hex color from value
					const hexMatch = this.plugin.settings.iconColor.match(/#[0-9A-Fa-f]{6}/);
					if (hexMatch) {
						colorInput.value = hexMatch[0];
					}
					
					colorInput.addEventListener("change", async (e) => {
						const hexColor = (e.target as HTMLInputElement).value;
						text.setValue(hexColor);
						this.plugin.settings.iconColor = hexColor;
						await this.plugin.saveSettings();
						this.plugin.processAllLinks();
					});
					
					// Update color picker when text changes
					text.inputEl.addEventListener("input", (e) => {
						const value = (e.target as HTMLInputElement).value;
						const hexMatch = value.match(/#[0-9A-Fa-f]{6}/);
						if (hexMatch) {
							colorInput.value = hexMatch[0];
						}
					});
				}
			});

		// Folder to icon mapping
		containerEl.createEl("h3", { text: "Folder Icon Mapping" });
		containerEl.createEl("p", {
			text: "Map folder paths to Lucide icon names. Leave folder path empty for root folder.",
			cls: "setting-item-description",
		});

		// Display existing mappings
		const mappingContainer = containerEl.createDiv("folder-icon-mappings");

		this.renderMappings(mappingContainer);

		// Add new mapping button
		new Setting(containerEl)
			.setName("Add folder mapping")
			.setDesc("Add a new folder-to-icon mapping")
			.addButton((button) =>
				button
					.setButtonText("Add mapping")
					.setCta()
					.onClick(() => {
						new FolderInputModal(this.app, (folderPath) => {
							// After folder path is entered, show icon picker
							new IconPickerModal(this.app, async (iconName) => {
								// Create mapping with icon
								this.plugin.settings.folderIconMap[folderPath] = { icon: iconName };
								await this.plugin.saveSettings();
								this.renderMappings(mappingContainer);
								this.plugin.processAllLinks();
							}).open();
						}).open();
					})
			);
	}

	renderMappings(container: HTMLElement): void {
		container.empty();

		for (const [folderPath, mapping] of Object.entries(this.plugin.settings.folderIconMap)) {
			const iconName = mapping.icon;
			const iconColor = mapping.color || this.plugin.settings.iconColor;
			
			const setting = new Setting(container)
				.setName(folderPath === "" ? "Root folder" : folderPath)
				.setDesc(`Icon: ${iconName}`)
				.addButton((button) => {
					// Create icon element and add to button
					const iconEl = this.plugin.createIconElement(iconName, iconColor);
					button.buttonEl.appendChild(iconEl);
					button.buttonEl.createSpan({ text: ` ${iconName}`, cls: "icon-name-text" });
					
					button
						.setTooltip("Click to change icon")
						.onClick(() => {
							// Show icon picker
							new IconPickerModal(this.app, async (newIconName) => {
								// Preserve existing color if set
								const existingColor = this.plugin.settings.folderIconMap[folderPath]?.color;
								this.plugin.settings.folderIconMap[folderPath] = { 
									icon: newIconName,
									...(existingColor ? { color: existingColor } : {})
								};
								await this.plugin.saveSettings();
								setting.setDesc(`Icon: ${newIconName}`);
								// Update button content
								button.buttonEl.empty();
								const newIconEl = this.plugin.createIconElement(newIconName, iconColor);
								button.buttonEl.appendChild(newIconEl);
								button.buttonEl.createSpan({ text: ` ${newIconName}`, cls: "icon-name-text" });
								this.plugin.processAllLinks();
							}).open();
						});
				})
				.addText((text) => {
					text.inputEl.addClass("link-icon-color-input");
					text
						.setPlaceholder("Default color")
						.setValue(mapping.color || "")
						.onChange(async (value: string) => {
							if (value.trim()) {
								this.plugin.settings.folderIconMap[folderPath] = {
									...mapping,
									color: value.trim()
								};
							} else {
								// Remove color to use default
								const { color, ...mappingWithoutColor } = this.plugin.settings.folderIconMap[folderPath];
								this.plugin.settings.folderIconMap[folderPath] = mappingWithoutColor;
							}
							await this.plugin.saveSettings();
							this.plugin.processAllLinks();
						});
					
					// Add color picker button next to text input
					const colorInput = text.inputEl.parentElement?.createEl("input", {
						type: "color",
						attr: { 
							style: "width: 30px; height: 30px; margin-left: 4px; cursor: pointer;",
							title: "Pick a color for this mapping"
						}
					}) as HTMLInputElement;
					
					if (colorInput) {
						// Set color picker value from mapping
						if (mapping.color) {
							const hexMatch = mapping.color.match(/#[0-9A-Fa-f]{6}/);
							if (hexMatch) {
								colorInput.value = hexMatch[0];
							}
						}
						
						colorInput.addEventListener("change", async (e) => {
							const hexColor = (e.target as HTMLInputElement).value;
							text.setValue(hexColor);
							this.plugin.settings.folderIconMap[folderPath] = {
								...mapping,
								color: hexColor
							};
							await this.plugin.saveSettings();
							this.plugin.processAllLinks();
						});
						
						// Update color picker when text changes
						text.inputEl.addEventListener("input", (e) => {
							const value = (e.target as HTMLInputElement).value;
							const hexMatch = value.match(/#[0-9A-Fa-f]{6}/);
							if (hexMatch) {
								colorInput.value = hexMatch[0];
							}
						});
					}
				})
				.addButton((button) =>
					button
						.setIcon("trash")
						.setTooltip("Delete mapping")
						.onClick(async () => {
							delete this.plugin.settings.folderIconMap[folderPath];
							await this.plugin.saveSettings();
							this.renderMappings(container);
							this.plugin.processAllLinks();
						})
				);
		}
	}
}

