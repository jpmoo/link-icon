# Publishing to Obsidian Community Plugins

## Prerequisites

1. ✅ Your plugin is on GitHub: https://github.com/jpmoo/link-icon
2. ✅ You have a README.md
3. ✅ You have a manifest.json
4. ✅ LICENSE file (MIT license)
5. ✅ manifest.json author fields filled in

## Step-by-Step Process

### 1. Add a License File

Create a LICENSE file (MIT is common and permissive):

```bash
# You can create an MIT license - most Obsidian plugins use this
```

### 2. Update manifest.json

Fill in the author information in `manifest.json`:
- `author`: Your name
- `authorUrl`: Your GitHub profile or website (optional)
- `fundingUrl`: If you want to accept donations (optional)

### 3. Create Your First Release on GitHub

1. Make sure your code is built:
   ```bash
   npm run build
   ```

2. On GitHub, go to your repository: https://github.com/jpmoo/link-icon

3. Click "Releases" → "Create a new release"

4. Create a new tag: `v1.0.0` (matching your manifest.json version)

5. Release title: `v1.0.0` or `Initial Release`

6. Attach these files to the release:
   - `main.js` (the built file)
   - `manifest.json`
   - `styles.css`

   To attach files:
   - Scroll down to "Attach binaries"
   - Drag and drop or browse for the files

7. Click "Publish release"

### 4. Submit to Obsidian Community Plugins

1. Go to: https://github.com/obsidianmd/obsidian-releases

2. Fork the repository

3. Navigate to: `community-plugins.json`

4. Click "Edit" (pencil icon)

5. Add your plugin entry at the end of the JSON array:

```json
{
  "id": "link-icon",
  "name": "Link Icon",
  "author": "jpmoo",
  "description": "Adds Lucide icons to internal wiki-links based on folder path. Works in both Reading View and Live Preview. Features per-folder icon and color customization.",
  "repo": "jpmoo/link-icon"
}
```

6. Click "Propose changes" (creates a Pull Request)

7. Wait for review - the Obsidian team will review your submission

### 5. After Approval

Once your PR is approved and merged, your plugin will appear in:
- Obsidian Settings → Community Plugins → Browse
- Users can install it directly from within Obsidian

## Important Notes

- Keep your releases in sync with your manifest.json version
- Each new version should create a new GitHub release with the same version tag
- Make sure `main.js` and `manifest.json` are always attached to releases
- Update the description in `community-plugins.json` if you want to change how it appears in the plugin browser

