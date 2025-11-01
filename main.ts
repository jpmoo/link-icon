import { Plugin, MarkdownView, TFile } from "obsidian";
import { LinkIconSettingTab, LinkIconSettings, DEFAULT_SETTINGS, FolderIconMapping } from "./src/settings";
import * as LucideIcons from "lucide";
import { WidgetType, Decoration, DecorationSet, ViewUpdate, ViewPlugin, EditorView } from "@codemirror/view";
import { StateField, StateEffect } from "@codemirror/state";

export default class LinkIconPlugin extends Plugin {
	settings: LinkIconSettings;
	private observer: MutationObserver | null = null;
	private mutationTimeout: ReturnType<typeof setTimeout> | null = null;
	private lastProcessTime: number = 0;
	private readonly MIN_PROCESS_INTERVAL = 500;
	private periodicCheckInterval: ReturnType<typeof setInterval> | null = null;

	async onload() {
		await this.loadSettings();

		// Add settings tab
		this.addSettingTab(new LinkIconSettingTab(this.app, this));

		// Process links when markdown view is opened
		this.registerEvent(
			this.app.workspace.on("file-open", () => {
				// Delay to ensure view is fully loaded
				setTimeout(() => {
					this.processAllLinks();
					this.updateObserver();
				}, 300);
			})
		);
		
		// Watch for new leaves being added
		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				setTimeout(() => {
					this.updateObserver();
				}, 200);
			})
		);

		// Process links when markdown is rendered (with higher priority for live preview)
		this.registerMarkdownPostProcessor((element, context) => {
			// Process after a short delay to ensure DOM is fully ready
			setTimeout(() => {
				this.clearExistingIcons(element);
				this.processLinksInElement(element);
			}, 50);
			// Also process again after a longer delay to catch late-rendered links
			setTimeout(() => {
				this.processLinksInElement(element);
			}, 200);
			// One more time for live preview links that render later
			setTimeout(() => {
				this.processLinksInElement(element);
			}, 500);
		}, -1); // Higher priority (lower number = higher priority)
		
		// Use CodeMirror decorations for live preview (prevents icons from being removed)
		this.registerEditorExtension(this.createLinkIconExtension());

		// Also listen to editor changes for live preview (with longer debounce)
		let editorChangeTimeout: ReturnType<typeof setTimeout> | null = null;
		let lastEditorChangeTime = 0;
		const MIN_EDITOR_CHANGE_INTERVAL = 300;
		
		this.registerEvent(
			this.app.workspace.on("editor-change", (editor, view) => {
				const now = Date.now();
				if (now - lastEditorChangeTime < MIN_EDITOR_CHANGE_INTERVAL) {
					return; // Skip if too soon
				}
				
				// Debounce processing to avoid excessive updates
				if (editorChangeTimeout) {
					clearTimeout(editorChangeTimeout);
				}
				editorChangeTimeout = setTimeout(() => {
					lastEditorChangeTime = Date.now();
					// Process the current view's preview if it exists
					if (view && view instanceof MarkdownView) {
						// Process live preview mode - find all preview containers
						if (view.previewMode) {
							// Try multiple ways to find the preview element
							let previewEl: HTMLElement | null = null;
							
							// Method 1: containerEl
							if (view.previewMode.containerEl) {
								previewEl = view.previewMode.containerEl.querySelector(".markdown-preview-view") as HTMLElement;
								if (!previewEl) {
									previewEl = view.previewMode.containerEl as HTMLElement;
								}
							}
							
							// Method 2: Try finding in the editor container
							if (!previewEl && view.contentEl) {
								previewEl = view.contentEl.querySelector(".markdown-preview-view") as HTMLElement;
							}
							
							// Method 3: Try the editor container itself
							if (!previewEl && view.contentEl) {
								const sourceView = view.contentEl.closest(".markdown-source-view");
								if (sourceView) {
									previewEl = sourceView.querySelector(".markdown-preview-view") as HTMLElement;
								}
							}
							
							if (previewEl) {
								this.clearExistingIcons(previewEl);
								this.processLinksInElement(previewEl);
							}
							
							// Also try processing the entire view container as fallback
							if (view.contentEl) {
								// Process any links in the entire content element
								this.processLinksInElement(view.contentEl);
							}
						}
						// Also process reading view
						if (view.contentEl) {
							this.clearExistingIcons(view.contentEl);
							this.processLinksInElement(view.contentEl);
						}
					}
				}, 200);
			})
		);

		// Also listen to active leaf changes
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				setTimeout(() => {
					this.processAllLinks();
				}, 100);
			})
		);

		// Process links on layout change (for live preview)
		this.app.workspace.onLayoutReady(() => {
			this.processAllLinks();
			this.setupObserver();
		});

		// Process existing views
		this.processAllLinks();
		
		// Periodic check for live preview (fallback)
		this.periodicCheckInterval = setInterval(() => {
			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (activeView && activeView.previewMode) {
				// Only process if in preview mode to avoid unnecessary work
				if (activeView.previewMode.containerEl) {
					const container = activeView.previewMode.containerEl;
					const previewEl = container.querySelector(".markdown-preview-view") || container;
					if (previewEl) {
						this.processLinksInElement(previewEl as HTMLElement);
					}
				}
			}
		}, 2000); // Check every 2 seconds
	}

	onunload() {
		if (this.observer) {
			this.observer.disconnect();
			this.observer = null;
		}
		if (this.periodicCheckInterval) {
			clearInterval(this.periodicCheckInterval);
			this.periodicCheckInterval = null;
		}
	}

	async loadSettings() {
		const loadedData = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
		
		// Migrate old format (string mappings) to new format (FolderIconMapping)
		if (loadedData && loadedData.folderIconMap) {
			const needsMigration = Object.values(loadedData.folderIconMap).some(
				(value: unknown) => typeof value === "string"
			);
			
			if (needsMigration) {
				const migratedMap: Record<string, FolderIconMapping> = {};
				for (const [folderPath, value] of Object.entries(loadedData.folderIconMap)) {
					if (typeof value === "string") {
						// Old format: just icon name
						migratedMap[folderPath] = { icon: value };
					} else {
						// Already in new format
						migratedMap[folderPath] = value as FolderIconMapping;
					}
				}
				this.settings.folderIconMap = migratedMap;
				await this.saveSettings();
			}
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Set up a mutation observer to watch for DOM changes in the markdown views
	 */
	setupObserver() {
		this.updateObserver();
	}
	
	updateObserver() {
		if (!this.observer) {
			this.observer = new MutationObserver((mutations) => {
				const now = Date.now();
				
				// Skip if we processed recently
				if (now - this.lastProcessTime < this.MIN_PROCESS_INTERVAL) {
					return;
				}
				
				let shouldProcess = false;
				for (const mutation of mutations) {
					if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
						// Only process if added nodes contain links
						for (const node of Array.from(mutation.addedNodes)) {
							if (node instanceof HTMLElement) {
								// Check if this is a link or contains links
								const isLink = node.tagName === "A" && (node.classList.contains("internal-link") || node.hasAttribute("data-href"));
								const containsLinks = node.querySelector && node.querySelector("a.internal-link, a[data-href]");
								
								if (isLink || containsLinks) {
									shouldProcess = true;
									break;
								}
							}
						}
					}
				}

				if (shouldProcess) {
					// Debounce the processing
					if (this.mutationTimeout) {
						clearTimeout(this.mutationTimeout);
					}
					this.mutationTimeout = setTimeout(() => {
						this.lastProcessTime = Date.now();
						this.processAllLinks();
					}, 300);
				}
			});
		} else {
			// Disconnect and reconnect to update observed elements
			this.observer.disconnect();
		}

		// Observe only markdown view containers, not entire document
		const markdownViews = this.app.workspace.getLeavesOfType("markdown");
		markdownViews.forEach((leaf) => {
			const view = leaf.view as MarkdownView;
			if (view.contentEl) {
				this.observer.observe(view.contentEl, {
					childList: true,
					subtree: true,
				});
			}
			if (view.previewMode?.containerEl) {
				this.observer.observe(view.previewMode.containerEl, {
					childList: true,
					subtree: true,
				});
			}
		});
	}

	/**
	 * Process all links in all active markdown views
	 */
	processAllLinks() {
		const markdownViews = this.app.workspace.getLeavesOfType("markdown");
		markdownViews.forEach((leaf) => {
			const view = leaf.view as MarkdownView;
			
			// Process reading view content
			if (view.contentEl) {
				this.clearExistingIcons(view.contentEl);
				this.processLinksInElement(view.contentEl);
			}
			
			// Process live preview mode - try multiple selectors
			if (view.previewMode) {
				// Try containerEl first
				if (view.previewMode.containerEl) {
					const container = view.previewMode.containerEl;
					
					// Look for preview view inside container
					const previewEl = container.querySelector(".markdown-preview-view") as HTMLElement;
					if (previewEl) {
						this.clearExistingIcons(previewEl);
						this.processLinksInElement(previewEl);
					}
					
					// Also process the container itself (in case links are directly in it)
					this.clearExistingIcons(container);
					this.processLinksInElement(container);
				}
				
				// Also try finding preview in the view's contentEl
				if (view.contentEl) {
					const previewInContent = view.contentEl.querySelector(".markdown-preview-view") as HTMLElement;
					if (previewInContent) {
						this.clearExistingIcons(previewInContent);
						this.processLinksInElement(previewInContent);
					}
				}
			}
		});
	}

	/**
	 * Clear existing link icons and reset processed markers
	 */
	clearExistingIcons(element: HTMLElement) {
		const existingIcons = element.querySelectorAll(".link-icon");
		existingIcons.forEach(icon => icon.remove());
		
		const processedLinks = element.querySelectorAll("[data-link-icon-processed]");
		processedLinks.forEach(link => {
			link.removeAttribute("data-link-icon-processed");
			link.removeAttribute("data-link-id");
		});
	}

	/**
	 * Process wiki-links in a specific element
	 */
	processLinksInElement(element: HTMLElement) {
		// Find all internal wiki-links ([[link]] format)
		// In live preview, links might be in different structures
		// Try multiple selectors as Obsidian may use different ones
		let linksToProcess: Element[] = [];
		
		// First, try standard selectors (most common case - reading view)
		const readingViewLinks = element.querySelectorAll("a.internal-link, a[data-href], .internal-link");
		linksToProcess = Array.from(readingViewLinks);
		
		// Handle live preview structure: span.cm-hmd-internal-link containing a.cm-underline
		// IMPORTANT: These spans are in the CodeMirror editor DOM, not the rendered preview
		const livePreviewContainers = element.querySelectorAll("span.cm-hmd-internal-link");
		livePreviewContainers.forEach((container) => {
			// Check if already processed
			if (container.hasAttribute("data-link-icon-processed")) {
				return;
			}
			
			// Get all the <a> tags inside this container to reconstruct the full link text
			const linkParts = Array.from(container.querySelectorAll("a.cm-underline, a"));
			if (linkParts.length > 0) {
				// Use the container as the link element for processing
				linksToProcess.push(container);
			}
		});
		
		// Also look for cm-hmd-internal-link in the entire document (for CodeMirror editor)
		// The markdown post processor might not catch these, so we search more broadly
		const allCmLinks = document.querySelectorAll("span.cm-hmd-internal-link");
		allCmLinks.forEach((cmLink) => {
			if (!linksToProcess.includes(cmLink) && !cmLink.hasAttribute("data-link-icon-processed")) {
				const linkParts = Array.from(cmLink.querySelectorAll("a.cm-underline, a"));
				if (linkParts.length > 0) {
					linksToProcess.push(cmLink);
				}
			}
		});
		
		// Also find other CodeMirror link elements
		const cmLinks = element.querySelectorAll("a.cm-link, span.cm-link");
		Array.from(cmLinks).forEach((link) => {
			if (!linksToProcess.includes(link) && !link.closest("span.cm-hmd-internal-link")) {
				linksToProcess.push(link);
			}
		});
		
		// Also find all links and check if they're internal (additional fallback)
		const allLinks = Array.from(element.querySelectorAll("a"));
		
		// Filter for internal links that we haven't already found
		const additionalLinks = allLinks.filter((link) => {
			// Skip if already in our list or inside a cm-hmd-internal-link
			if (linksToProcess.includes(link) || link.closest("span.cm-hmd-internal-link")) {
				return false;
			}
			
			const href = link.getAttribute("href") || link.getAttribute("data-href") || link.getAttribute("data-link") || "";
			
			// Check if it's an internal link
			const isInternal = 
				link.classList.contains("internal-link") ||
				link.hasAttribute("data-href") ||
				link.hasAttribute("data-link") ||
				(href && (
					href.startsWith("#") || 
					(!href.includes("://") && !href.includes("mailto:") && !href.startsWith("http") && href !== "" && !href.startsWith("file://"))
				));
			
			return isInternal;
		});
		
		linksToProcess = [...linksToProcess, ...additionalLinks];
		
		linksToProcess.forEach((link) => {
			// Skip if already processed
			if (link.hasAttribute("data-link-icon-processed")) {
				return;
			}

			// Handle different link structures
			const linkElement = link as HTMLElement;
			let actualLinkElement: HTMLElement | null = null;
			let linkPath = "";
			
			// Special handling for live preview: span.cm-hmd-internal-link
			if (link.tagName === "SPAN" && link.classList.contains("cm-hmd-internal-link")) {
				// Get all link parts inside to reconstruct full text
				const linkParts = Array.from(link.querySelectorAll("a.cm-underline, a"));
				if (linkParts.length > 0) {
					// Reconstruct the full link text from all parts
					linkPath = linkParts.map(part => part.textContent?.trim() || "").join("").trim();
				} else {
					// Fallback: use container text
					linkPath = link.textContent?.trim() || "";
				}
				
				// Link found in live preview
			}
			// Handle CodeMirror span.cm-link
			else if (link.tagName === "SPAN" && link.classList.contains("cm-link")) {
				// Check if there's an <a> tag inside
				const innerLink = link.querySelector("a");
				if (innerLink) {
					actualLinkElement = innerLink;
				} else {
					// Use the span itself
					actualLinkElement = linkElement;
				}
				
				// Try to get path from inner link
				const href = actualLinkElement.getAttribute("href") || 
				             actualLinkElement.getAttribute("data-href") || 
				             actualLinkElement.getAttribute("data-link") || "";
				
				if (href.startsWith("#")) {
					linkPath = href.substring(1) || linkElement.textContent?.trim() || "";
				} else if (href && href !== "#" && !href.includes("://") && !href.includes("mailto:")) {
					linkPath = href;
				} else {
					linkPath = linkElement.textContent?.trim() || "";
				}
			}
			// Standard anchor element
			else {
				actualLinkElement = linkElement as HTMLAnchorElement;
				
				// Try multiple ways to get the link path
				let href = actualLinkElement.getAttribute("href") || 
				           actualLinkElement.getAttribute("data-href") || 
				           actualLinkElement.getAttribute("data-link") ||
				           "";
				
				// Handle different href formats
				if (href.startsWith("#")) {
					linkPath = href.substring(1);
					// If href is just "#", use link text as path
					if (!linkPath || linkPath === "") {
						linkPath = linkElement.textContent?.trim() || "";
					}
				} else if (href.startsWith("/")) {
					// Some links might have absolute paths
					linkPath = href.substring(1);
				} else if (href && href !== "#" && !href.includes("://") && !href.includes("mailto:")) {
					// Relative path (but not just "#")
					linkPath = href;
				} else {
					// Try to get from data attribute or text content
					const dataHref = actualLinkElement.getAttribute("data-href") || actualLinkElement.getAttribute("data-link");
					if (dataHref && dataHref !== "#") {
						linkPath = dataHref.startsWith("#") ? dataHref.substring(1) : dataHref;
						if (!linkPath || linkPath === "") {
							linkPath = linkElement.textContent?.trim() || "";
						}
					} else {
						// Fallback: use the link text as the path
						linkPath = linkElement.textContent?.trim() || "";
					}
				}
			}
			
			if (!linkPath) {
				return;
			}

			// Get the file for this link
			const file = this.app.metadataCache.getFirstLinkpathDest(linkPath, "");
			
			if (!file || !(file instanceof TFile)) {
				return;
			}

			// Get the folder path (parent folder)
			const folderPath = file.parent ? file.parent.path : "";
			const normalizedFolderPath = folderPath === "" ? "" : folderPath;

			// Find matching icon mapping
			let iconMapping = this.findIconForFolder(normalizedFolderPath);

			if (iconMapping) {
				// Check if icon already exists for this link
				const linkId = linkElement.getAttribute("data-link-id") || `link-${Date.now()}-${Math.random()}`;
				linkElement.setAttribute("data-link-id", linkId);
				
				// For live preview spans, check parent container
				const containerToCheck = link.tagName === "SPAN" && link.classList.contains("cm-hmd-internal-link")
					? link.parentElement
					: linkElement.parentElement;
				
				if (!containerToCheck) return;
				
				const existingIcon = containerToCheck.querySelector(`.link-icon[data-link-id="${linkId}"]`);
				if (existingIcon) {
					linkElement.setAttribute("data-link-icon-processed", "true");
					return;
				}

				// Create icon element with mapping-specific color
				const iconColor = iconMapping.color || this.settings.iconColor;
				const iconElement = this.createIconElement(iconMapping.icon, iconColor);
				iconElement.setAttribute("data-link-id", linkId);

				// Insert icon based on position setting
				// For live preview spans, we need to be careful about insertion
				let insertionParent: HTMLElement | null = null;
				let insertionReference: Node | null = null;
				
				if (link.tagName === "SPAN" && link.classList.contains("cm-hmd-internal-link")) {
					// For CodeMirror spans, insert in the same parent
					insertionParent = link.parentElement;
					insertionReference = link;
				} else {
					insertionParent = linkElement.parentElement;
					insertionReference = link;
				}
				
				if (!insertionParent || !insertionReference) {
					return;
				}
				
				try {
					if (this.settings.iconPosition === "before") {
						// Insert before the link
						insertionParent.insertBefore(iconElement, insertionReference);
					} else {
						// Insert after the link
						if (insertionReference.nextSibling) {
							insertionParent.insertBefore(iconElement, insertionReference.nextSibling);
						} else {
							insertionParent.appendChild(iconElement);
						}
					}
				} catch (e) {
					// If insertion fails, try appending to parent
					try {
						insertionParent.appendChild(iconElement);
					} catch (e2) {
						// Failed to insert icon
					}
				}

				// Mark as processed
				linkElement.setAttribute("data-link-icon-processed", "true");
			}
		});
	}

	/**
	 * Find the icon mapping for a given folder path
	 */
	findIconForFolder(folderPath: string): FolderIconMapping | null {
		// Try exact match first
		if (this.settings.folderIconMap[folderPath]) {
			return this.settings.folderIconMap[folderPath];
		}

		// Try parent folders (more specific to less specific)
		const pathParts = folderPath.split("/").filter(p => p !== "");
		for (let i = pathParts.length; i > 0; i--) {
			const partialPath = pathParts.slice(0, i).join("/");
			if (this.settings.folderIconMap[partialPath]) {
				return this.settings.folderIconMap[partialPath];
			}
		}

		// Try root folder default
		if (this.settings.folderIconMap[""]) {
			return this.settings.folderIconMap[""];
		}

		return null;
	}

	/**
	 * Create a CodeMirror extension for link icons
	 */
	createLinkIconExtension() {
		const plugin = this;
		
		const iconField = StateField.define<DecorationSet>({
			create() {
				return Decoration.none;
			},
			update(decorations, tr) {
				decorations = decorations.map(tr.changes);
				
				// Find links in the document and add decorations
				const newDecorations: Array<ReturnType<ReturnType<typeof Decoration.widget>["range"]>> = [];
				
				// Process the document to find links
				const doc = tr.state.doc;
				const text = doc.toString();
				
				// Simple regex to find wiki-links [[link]] or [[link|alias]]
				const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
				let match;
				
				while ((match = wikiLinkRegex.exec(text)) !== null) {
					const start = match.index;
					const end = start + match[0].length;
					const linkText = match[1].split('|')[0]; // Get link part, ignore alias
					
					// Get the icon mapping for this link
					const file = plugin.app.metadataCache.getFirstLinkpathDest(linkText, "");
					if (file && file instanceof TFile) {
						const folderPath = file.parent ? file.parent.path : "";
						const iconMapping = plugin.findIconForFolder(folderPath);
						
						if (iconMapping) {
							const iconColor = iconMapping.color || plugin.settings.iconColor;
							const widget = new LinkIconWidget(iconMapping.icon, iconColor, plugin.settings.iconSize);
							
							if (plugin.settings.iconPosition === "before") {
								const decoration = Decoration.widget({
									widget,
									side: -1
								});
								newDecorations.push(decoration.range(start));
							} else {
								const decoration = Decoration.widget({
									widget,
									side: 1
								});
								newDecorations.push(decoration.range(end));
							}
						}
					}
				}
				
				return Decoration.set(newDecorations);
			},
			provide(field) {
				return EditorView.decorations.from(field);
			}
		});
		
		return iconField;
	}

	/**
	 * Get a Lucide icon by PascalCase name with type safety
	 */
	private getLucideIcon(pascalKey: string): unknown {
		// Use Record type for safer access than 'as any'
		const icons = LucideIcons as Record<string, unknown>;
		return icons[pascalKey] || null;
	}

	/**
	 * Create an SVG icon element from Lucide
	 */
	createIconElement(iconName: string, color?: string): HTMLElement {
		const iconContainer = document.createElement("span");
		iconContainer.addClass("link-icon");
		iconContainer.addClass(this.settings.iconPosition === "before" ? "link-icon-before" : "link-icon-after");

		try {
			// Get the icon from Lucide (convert kebab-case to PascalCase)
			const pascalKey = this.toPascalCase(iconName);
			const Icon = this.getLucideIcon(pascalKey);
			
			if (!Icon) {
				throw new Error(`Icon "${iconName}" (${pascalKey}) not found in Lucide`);
			}

			// Create SVG element
			const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
			svg.setAttribute("width", this.settings.iconSize.toString());
			svg.setAttribute("height", this.settings.iconSize.toString());
			svg.setAttribute("viewBox", "0 0 24 24");
			svg.setAttribute("fill", "none");
			svg.setAttribute("stroke", color || this.settings.iconColor);
			svg.setAttribute("stroke-width", "2");
			svg.setAttribute("stroke-linecap", "round");
			svg.setAttribute("stroke-linejoin", "round");
			
			// Lucide icon structure: ['svg', {svgAttrs}, [children]]
			if (!Array.isArray(Icon)) {
				throw new Error(`Icon "${iconName}" is not an array structure`);
			}
			
			// Standard Lucide structure: ['svg', {attrs}, [children]]
			if (Icon.length === 3 && Icon[0] === "svg" && typeof Icon[1] === "object" && Array.isArray(Icon[2])) {
				// Apply SVG attributes (ignore, we set our own)
				// Process children array
				const children = Icon[2];
				children.forEach((child: unknown) => {
					if (Array.isArray(child) && child.length >= 2) {
						const tagName = child[0];
						const attrs = child[1];
						this.createSvgElement(svg, tagName, attrs);
					}
				});
			}
			// Fallback: array of arrays
			else if (Icon.length > 0 && Array.isArray(Icon[0])) {
				Icon.forEach((item: unknown) => {
					if (Array.isArray(item) && item.length >= 2) {
						const tagName = item[0];
						const attrs = item[1];
						this.createSvgElement(svg, tagName, attrs);
					}
				});
			}
			// Fallback: alternating tag and attrs
			else if (Icon.length >= 2 && typeof Icon[0] === "string") {
				for (let i = 0; i < Icon.length; i += 2) {
					const tagName = Icon[i];
					const attrs = Icon[i + 1];
					
					if (!tagName || !attrs) continue;
					
					this.createSvgElement(svg, tagName, attrs);
				}
			}
			else {
				throw new Error(`Unknown icon structure for "${iconName}"`);
			}
			
			// Only append if SVG has children
			if (svg.children.length > 0) {
				iconContainer.appendChild(svg);
			} else {
				throw new Error("No SVG paths created");
			}
		} catch (error) {
			// Fallback: create a default file icon
			const svg = this.createDefaultIcon();
			iconContainer.appendChild(svg);
		}

		return iconContainer;
	}

	/**
	 * Create an SVG element from tag name and attributes
	 */
	private createSvgElement(svg: SVGSVGElement, tagName: string, attrs: Record<string, unknown>): void {
		if (!tagName || !attrs) return;
		
		if (tagName === "path") {
			const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
			const dValue = attrs.d;
			if (typeof dValue === "string") {
				path.setAttribute("d", dValue);
			}
			const fillValue = attrs.fill;
			if (typeof fillValue === "string") {
				path.setAttribute("fill", fillValue);
			}
			svg.appendChild(path);
		} else if (tagName === "circle") {
			const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
			Object.keys(attrs).forEach(key => {
				const value = attrs[key];
				if (typeof value === "string" || typeof value === "number") {
					circle.setAttribute(key, String(value));
				}
			});
			svg.appendChild(circle);
		} else if (tagName === "line") {
			const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
			Object.keys(attrs).forEach(key => {
				const value = attrs[key];
				if (typeof value === "string" || typeof value === "number") {
					line.setAttribute(key, String(value));
				}
			});
			svg.appendChild(line);
		} else if (tagName === "polyline") {
			const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
			Object.keys(attrs).forEach(key => {
				const value = attrs[key];
				if (typeof value === "string" || typeof value === "number") {
					polyline.setAttribute(key, String(value));
				}
			});
			svg.appendChild(polyline);
		} else if (tagName === "rect") {
			const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
			Object.keys(attrs).forEach(key => {
				const value = attrs[key];
				if (typeof value === "string" || typeof value === "number") {
					rect.setAttribute(key, String(value));
				}
			});
			svg.appendChild(rect);
		} else {
			// Generic element
			const element = document.createElementNS("http://www.w3.org/2000/svg", tagName);
			Object.keys(attrs).forEach(key => {
				const value = attrs[key];
				if (typeof value === "string" || typeof value === "number") {
					element.setAttribute(key, String(value));
				}
			});
			svg.appendChild(element);
		}
	}

	/**
	 * Create a default file icon SVG
	 */
	private createDefaultIcon(): SVGSVGElement {
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("width", this.settings.iconSize.toString());
		svg.setAttribute("height", this.settings.iconSize.toString());
		svg.setAttribute("viewBox", "0 0 24 24");
		svg.setAttribute("fill", "none");
		svg.setAttribute("stroke", this.settings.iconColor);
		svg.setAttribute("stroke-width", "2");
		svg.setAttribute("stroke-linecap", "round");
		svg.setAttribute("stroke-linejoin", "round");
		
		const path1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
		path1.setAttribute("d", "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z");
		svg.appendChild(path1);
		
		const path2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
		path2.setAttribute("d", "M14 2v6h6");
		svg.appendChild(path2);
		
		return svg;
	}

	/**
	 * Convert kebab-case or snake_case to PascalCase
	 */
	toPascalCase(str: string): string {
		return str
			.split(/[-_]/)
			.map(word => word.charAt(0).toUpperCase() + word.slice(1))
			.join("");
	}
}

/**
 * CodeMirror widget for displaying link icons
 */
class LinkIconWidget extends WidgetType {
	constructor(
		private iconName: string,
		private color: string,
		private size: number
	) {
		super();
	}

	/**
	 * Get a Lucide icon by PascalCase name with type safety
	 */
	private getLucideIcon(pascalKey: string): unknown {
		// Use Record type for safer access than 'as any'
		const icons = LucideIcons as Record<string, unknown>;
		return icons[pascalKey] || null;
	}

	toDOM() {
		const iconContainer = document.createElement("span");
		iconContainer.addClass("link-icon");
		iconContainer.addClass("link-icon-widget");

		try {
			// Get the icon from Lucide (convert kebab-case to PascalCase)
			const pascalKey = this.toPascalCase(this.iconName);
			const Icon = this.getLucideIcon(pascalKey);
			
			if (!Icon) {
				return iconContainer;
			}

			// Create SVG element
			const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
			svg.setAttribute("width", this.size.toString());
			svg.setAttribute("height", this.size.toString());
			svg.setAttribute("viewBox", "0 0 24 24");
			svg.setAttribute("fill", "none");
			svg.setAttribute("stroke", this.color);
			svg.setAttribute("stroke-width", "2");
			svg.setAttribute("stroke-linecap", "round");
			svg.setAttribute("stroke-linejoin", "round");
			
			// Parse Lucide icon structure
			if (Array.isArray(Icon) && Icon.length === 3 && Icon[0] === "svg" && typeof Icon[1] === "object" && Array.isArray(Icon[2])) {
				const children = Icon[2];
				children.forEach((child: unknown) => {
					if (Array.isArray(child) && child.length >= 2) {
						const tagName = child[0];
						const attrs = child[1];
						if (typeof tagName === "string" && attrs && typeof attrs === "object") {
							this.createSvgElement(svg, tagName, attrs as Record<string, unknown>);
						}
					}
				});
			}
			
			if (svg.children.length > 0) {
				iconContainer.appendChild(svg);
			}
		} catch (error) {
			// Fail silently
		}

		return iconContainer;
	}

	private toPascalCase(str: string): string {
		return str
			.split("-")
			.map(word => word.charAt(0).toUpperCase() + word.slice(1))
			.join("");
	}

	private createSvgElement(svg: SVGSVGElement, tagName: string, attrs: Record<string, unknown>): void {
		if (!tagName || !attrs) return;
		
		if (tagName === "path") {
			const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
			const dValue = attrs.d;
			if (typeof dValue === "string") {
				path.setAttribute("d", dValue);
			}
			const fillValue = attrs.fill;
			if (typeof fillValue === "string") {
				path.setAttribute("fill", fillValue);
			}
			const strokeValue = attrs.stroke;
			if (typeof strokeValue === "string") {
				path.setAttribute("stroke", strokeValue);
			}
			svg.appendChild(path);
		} else if (tagName === "circle") {
			const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
			Object.keys(attrs).forEach(key => {
				const value = attrs[key];
				if (typeof value === "string" || typeof value === "number") {
					circle.setAttribute(key, String(value));
				}
			});
			svg.appendChild(circle);
		} else if (tagName === "line") {
			const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
			Object.keys(attrs).forEach(key => {
				const value = attrs[key];
				if (typeof value === "string" || typeof value === "number") {
					line.setAttribute(key, String(value));
				}
			});
			svg.appendChild(line);
		} else if (tagName === "polyline") {
			const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
			Object.keys(attrs).forEach(key => {
				const value = attrs[key];
				if (typeof value === "string" || typeof value === "number") {
					polyline.setAttribute(key, String(value));
				}
			});
			svg.appendChild(polyline);
		} else if (tagName === "rect") {
			const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
			Object.keys(attrs).forEach(key => {
				const value = attrs[key];
				if (typeof value === "string" || typeof value === "number") {
					rect.setAttribute(key, String(value));
				}
			});
			svg.appendChild(rect);
		} else {
			// Generic element
			const element = document.createElementNS("http://www.w3.org/2000/svg", tagName);
			Object.keys(attrs).forEach(key => {
				const value = attrs[key];
				if (typeof value === "string" || typeof value === "number") {
					element.setAttribute(key, String(value));
				}
			});
			svg.appendChild(element);
		}
	}
}
