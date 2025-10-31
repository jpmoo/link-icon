import { Modal, App, Setting } from "obsidian";
import * as LucideIcons from "lucide";

export class IconPickerModal extends Modal {
	private selectedIcon: string | null = null;
	private onSelect: (iconName: string) => void;
	private searchInput: HTMLInputElement;
	private iconGrid: HTMLElement;
	private allIcons: string[] = [];
	private iconMap: Map<string, string> = new Map(); // kebab-case -> PascalCase

	constructor(app: App, onSelect: (iconName: string) => void) {
		super(app);
		this.onSelect = onSelect;
		this.getAllAvailableIcons();
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Select Lucide Icon" });

		// Search input
		const searchContainer = contentEl.createDiv("icon-picker-search");
		this.searchInput = searchContainer.createEl("input", {
			type: "text",
			placeholder: "Search icons...",
			cls: "icon-picker-search-input",
		});
		this.searchInput.addEventListener("input", () => {
			this.filterIcons(this.searchInput.value);
		});

		// Icon grid
		this.iconGrid = contentEl.createDiv("icon-picker-grid");
		this.renderIcons(this.allIcons);

		// Buttons
		const buttonContainer = contentEl.createDiv("icon-picker-buttons");
		new Setting(buttonContainer)
			.addButton((button) =>
				button
					.setButtonText("Cancel")
					.onClick(() => {
						this.close();
					})
			)
			.addButton((button) =>
				button
					.setButtonText("Select")
					.setCta()
					.onClick(() => {
						if (this.selectedIcon) {
							this.onSelect(this.selectedIcon);
							this.close();
						}
					})
			);

		// Focus search input
		setTimeout(() => {
			this.searchInput.focus();
		}, 100);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	private getAllAvailableIcons(): void {
		// Get all exported icons from Lucide
		// Lucide exports icons with PascalCase names
		const iconKeys = Object.keys(LucideIcons);
		console.log(`[IconPicker] Total Lucide exports: ${iconKeys.length}`);
		
		// Filter to get only icon components and exclude utility functions
		const excludedKeys = [
			"createElement", "icons", "Icon", "default", "lucideReactNative",
			"toElement", "createIcons", "defaultProps", "IconNode", "IconProps"
		];
		
		
		// Get all exports that are arrays (icon data) or have icon data
		iconKeys.forEach(key => {
			if (excludedKeys.includes(key)) return;
			if (key.startsWith("_")) return;
			
			const icon = (LucideIcons as any)[key];
			// Icons are arrays with path data: ['path', { d: '...', ... }, ...]
			if (Array.isArray(icon) && icon.length > 0) {
				// Convert PascalCase to kebab-case
				const kebabCase = key
					.replace(/([a-z])([A-Z])/g, "$1-$2")
					.replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
					.toLowerCase();
				
				if (kebabCase.length > 0) {
					this.iconMap.set(kebabCase, key);
				}
			}
		});
		
		this.allIcons = Array.from(this.iconMap.keys()).sort();
	}

	private filterIcons(searchTerm: string): void {
		const filtered = this.allIcons.filter(icon =>
			icon.toLowerCase().includes(searchTerm.toLowerCase())
		);
		this.renderIcons(filtered);
	}

	private renderIcons(icons: string[]): void {
		this.iconGrid.empty();

		if (icons.length === 0) {
			this.iconGrid.createEl("p", {
				text: "No icons found",
				cls: "icon-picker-empty",
			});
			return;
		}

		icons.forEach(iconName => {
			const iconContainer = this.iconGrid.createDiv("icon-picker-item");
			iconContainer.setAttribute("data-icon", iconName);
			
			if (this.selectedIcon === iconName) {
				iconContainer.addClass("selected");
			}

			// Try to render the icon
			try {
				// Use the stored PascalCase name
				const pascalKey = this.iconMap.get(iconName) || this.toPascalCase(iconName);
				const Icon = (LucideIcons as any)[pascalKey];
				
				if (Icon) {
					const svg = this.createIconPreview(Icon, iconName);
					if (svg) {
						iconContainer.appendChild(svg);
					}
				}
			} catch (e) {
				// If icon rendering fails, just show the name
			}

			// Icon name label
			const label = iconContainer.createDiv("icon-picker-label");
			label.textContent = iconName;

			// Click handler
			iconContainer.addEventListener("click", () => {
				// Remove previous selection
				this.iconGrid.querySelectorAll(".selected").forEach(el => {
					el.removeClass("selected");
				});
				
				// Select this icon
				iconContainer.addClass("selected");
				this.selectedIcon = iconName;
			});
		});
	}

	private createIconPreview(Icon: any, iconName: string): SVGElement | null {
		try {
			if (!Array.isArray(Icon)) {
				return null;
			}
			
			
			// Create SVG element
			const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
			svg.setAttribute("width", "24");
			svg.setAttribute("height", "24");
			svg.setAttribute("viewBox", "0 0 24 24");
			svg.setAttribute("fill", "none");
			svg.setAttribute("stroke", "currentColor");
			svg.setAttribute("stroke-width", "2");
			svg.setAttribute("stroke-linecap", "round");
			svg.setAttribute("stroke-linejoin", "round");

			// Lucide icon structure: ['svg', {svgAttrs}, [children]]
			// where children is: [['path', {d: '...'}], ['path', {d: '...'}], ...]
			if (Icon.length === 3 && Icon[0] === "svg" && typeof Icon[1] === "object" && Array.isArray(Icon[2])) {
				// Apply SVG attributes from element 1
				const svgAttrs = Icon[1];
				Object.keys(svgAttrs).forEach(key => {
					if (key !== "children") {
						svg.setAttribute(key, svgAttrs[key]);
					}
				});
				
				// Process children array (element 2)
				const children = Icon[2];
				children.forEach((child: any) => {
					if (Array.isArray(child) && child.length >= 2) {
						const tagName = child[0];
						const attrs = child[1];
						this.createSvgElement(svg, tagName, attrs);
					}
				});
			}
			// Fallback: Try array of arrays [['path', { d: '...' }], ['path', { d: '...' }]]
			else if (Icon.length > 0 && Array.isArray(Icon[0])) {
				Icon.forEach((item: any) => {
					if (Array.isArray(item) && item.length >= 2) {
						const tagName = item[0];
						const attrs = item[1];
						this.createSvgElement(svg, tagName, attrs);
					}
				});
			}
			// Fallback: alternating tag and attrs ['path', { d: '...' }, 'path', { d: '...' }]
			else if (Icon.length >= 2 && typeof Icon[0] === "string" && (Icon[0] === "path" || Icon[0] === "circle" || Icon[0] === "line" || Icon[0] === "polyline" || Icon[0] === "rect")) {
				if (typeof Icon[1] === "object" && Icon[1] !== null && !Array.isArray(Icon[1])) {
					for (let i = 0; i < Icon.length; i += 2) {
						const tagName = Icon[i];
						const attrs = Icon[i + 1];
						
						if (!tagName || !attrs || typeof attrs !== "object") continue;
						
						this.createSvgElement(svg, tagName, attrs);
					}
				}
			}
			else {
				// Unknown structure
				return null;
			}
			
			return svg.children.length > 0 ? svg : null;
		} catch (e) {
			// Error creating icon - return null
		}
		return null;
	}
	
	private createSvgElement(svg: SVGSVGElement, tagName: string, attrs: any): void {
		if (!tagName || !attrs) return;
		
		if (tagName === "path") {
			const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
			if (attrs.d) {
				path.setAttribute("d", attrs.d);
			}
			if (attrs.fill) {
				path.setAttribute("fill", attrs.fill);
			}
			svg.appendChild(path);
		} else if (tagName === "circle") {
			const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
			Object.keys(attrs).forEach(key => {
				circle.setAttribute(key, attrs[key]);
			});
			svg.appendChild(circle);
		} else if (tagName === "line") {
			const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
			Object.keys(attrs).forEach(key => {
				line.setAttribute(key, attrs[key]);
			});
			svg.appendChild(line);
		} else if (tagName === "polyline") {
			const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
			Object.keys(attrs).forEach(key => {
				polyline.setAttribute(key, attrs[key]);
			});
			svg.appendChild(polyline);
		} else if (tagName === "rect") {
			const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
			Object.keys(attrs).forEach(key => {
				rect.setAttribute(key, attrs[key]);
			});
			svg.appendChild(rect);
		}
	}
	
	private addChildrenToSvg(svg: SVGSVGElement, children: any[]): void {
		children.forEach((child: any) => {
			if (!child) return;
			
			const tagName = child.tag || child.type || (child.$$typeof ? "react-element" : null);
			const attrs = child.attrs || child.props || child.attributes || {};
			
			if (tagName === "path" || (child.$$typeof && child.type === "path")) {
				const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
				if (attrs.d) {
					path.setAttribute("d", attrs.d);
				}
				if (attrs.fill) {
					path.setAttribute("fill", attrs.fill);
				}
				svg.appendChild(path);
			} else if (tagName === "circle" || (child.$$typeof && child.type === "circle")) {
				const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
				Object.keys(attrs).forEach(key => {
					if (key !== "children") {
						circle.setAttribute(key, attrs[key]);
					}
				});
				svg.appendChild(circle);
			} else if (tagName === "line" || (child.$$typeof && child.type === "line")) {
				const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
				Object.keys(attrs).forEach(key => {
					if (key !== "children") {
						line.setAttribute(key, attrs[key]);
					}
				});
				svg.appendChild(line);
			} else if (child.$$typeof && child.type) {
				// React element - recurse
				if (attrs.children) {
					const childChildren = Array.isArray(attrs.children) 
						? attrs.children 
						: [attrs.children];
					this.addChildrenToSvg(svg, childChildren);
				}
			}
		});
	}
	
	private renderReactLikeIcon(svg: SVGSVGElement, iconData: any): void {
		if (iconData.props && iconData.props.children) {
			const children = Array.isArray(iconData.props.children) 
				? iconData.props.children 
				: [iconData.props.children];
			children.forEach((child: any) => {
				if (child && (child.type || child.tag)) {
					this.addSvgChild(svg, { 
						tag: child.type || child.tag, 
						attrs: child.props || child.attrs || {} 
					});
				}
			});
		}
	}

	private addSvgChild(svg: SVGSVGElement, child: any): void {
		if (!child) return;
		
		const tagName = child.tag || child.type || "path";
		const attrs = child.attrs || child.attributes || {};
		
		if (tagName === "path") {
			const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
			if (attrs.d) {
				path.setAttribute("d", attrs.d);
			}
			svg.appendChild(path);
		} else if (tagName === "circle") {
			const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
			Object.keys(attrs).forEach(key => {
				circle.setAttribute(key, attrs[key]);
			});
			svg.appendChild(circle);
		} else if (tagName === "line") {
			const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
			Object.keys(attrs).forEach(key => {
				line.setAttribute(key, attrs[key]);
			});
			svg.appendChild(line);
		}
	}

	private toPascalCase(str: string): string {
		return str
			.split(/[-_]/)
			.map(word => word.charAt(0).toUpperCase() + word.slice(1))
			.join("");
	}
}

