# Link Icon Plugin

An Obsidian plugin that adds Lucide icons to internal wiki-links based on the folder path of the linked file.

## Features

- 🎨 Add Lucide icons to internal wiki-links
- 📁 Map folder paths to specific icons with per-folder colors
- ⚙️ Customize icon position (before or after the link)
- 🎨 Adjustable icon size and default color
- 🎨 Per-mapping color customization with visual color picker
- 🔄 Automatically processes links in markdown views
- 👁️ Works in both Reading View and Live Preview mode
- 🎯 Uses CodeMirror decorations for stable rendering in Live Preview

## Installation

1. Copy this plugin folder to your Obsidian vault's `.obsidian/plugins/` directory
2. Run `npm install` to install dependencies
3. Run `npm run build` to build the plugin
4. Enable the plugin in Obsidian Settings > Community Plugins

## Development

```bash
# Install dependencies
npm install

# Build in production mode
npm run build

# Build in development mode with watch
npm run dev
```

## Usage

1. Open Settings > Link Icon Settings
2. Configure icon position (before or after link)
3. Set default icon size and color (used as fallback for mappings without custom colors)
4. Add folder-to-icon mappings:
   - Click "Add mapping"
   - Select folder path from the autocomplete dropdown (or leave empty for root folder)
   - Pick an icon from the visual icon picker
   - Optionally set a custom color for this specific mapping using the color picker or CSS color
5. Icons will automatically appear next to links in both Reading View and Live Preview

## Supported Icons

All icons from [Lucide](https://lucide.dev/) are supported. Common examples:
- `file-text` - Text files
- `folder` - Folders
- `calendar` - Daily notes
- `archive` - Archive folders
- `paperclip` - Attachments
- `layout-template` - Templates
- And many more...

## Settings

- **Icon position**: Choose whether icons appear before or after the link
- **Icon size**: Adjust icon size (10-32 pixels) - applies to all icons
- **Default icon color**: Set default color for icons (CSS color, hex code, or CSS variable like `var(--text-normal)`). Includes a visual color picker.
- **Folder Icon Mapping**: Map folder paths to specific icons
  - Each mapping can have its own custom icon
  - Each mapping can optionally have its own custom color (overrides default color)
  - Visual icon picker shows all available Lucide icons
  - Color picker allows easy selection of hex colors or CSS variables

## How It Works

The plugin:
1. Detects internal wiki-links (`[[link]]`) in markdown views (both Reading View and Live Preview)
2. Resolves the linked file and gets its folder path
3. Matches the folder path to an icon mapping using your settings
4. Uses the mapping-specific color if set, otherwise falls back to the default color
5. Renders the icon before or after the link based on your position setting

### Technical Details

- **Reading View**: Uses markdown post-processor to add icons to rendered HTML
- **Live Preview**: Uses CodeMirror decorations and widgets for stable, persistent icon rendering
- Icons are matched from most specific to least specific:
  - Exact folder path match
  - Parent folder matches (walking up the directory tree)
  - Root folder default (if a mapping exists for empty path)

### Icon Matching

When a link points to a file, the plugin:
1. Gets the file's parent folder path
2. Checks for an exact match in your folder mappings
3. If no exact match, walks up the directory tree checking parent folders
4. Uses the most specific match found
5. If no mapping exists, no icon is shown

