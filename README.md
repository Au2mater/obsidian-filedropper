# File Dropper

An Obsidian plugin that links to files instead of copying them. Drag a file from Explorer, Finder or your file manager into a note, and the plugin inserts a clickable link to the file where it already is. Nothing is copied into your vault.

## What you get

| You drop | The plugin inserts |
|---|---|
| A file outside the vault | `[report.pdf](<file:///C:/Users/me/Downloads/report.pdf>)`. Clicking it opens the file in its default app. |
| A file inside the vault | A normal Obsidian link, following your link settings (wikilink or Markdown). |
| Several files | One link per line. |

The link goes where you drop it. Spaces and parentheses in the path stay readable, because the link target is wrapped in `<…>`.

## Copying into the vault anyway

Hold **Ctrl** (**Option** on macOS) while dropping to get Obsidian's normal behaviour, which copies the file into your attachment folder. That is also the "copy" key in Explorer and Finder.

If the plugin can't see a real path for a dropped item, for example an image dragged from a browser or an attachment dragged from an email, it leaves the drop to Obsidian.

## Notes

- Desktop only. On mobile there are no file paths to link to.
- A `file:///` link only works on computers where the file is at the same path. Links to files on a shared drive or in a synced folder like OneDrive work on every computer that has the same path.
- The plugin reads nothing and sends nothing. It only turns the dropped file's path into a link.

## Installing manually

Download `main.js` and `manifest.json` from the latest release into `<vault>/.obsidian/plugins/file-dropper/`, reload Obsidian, and enable **File Dropper** under Settings → Community plugins.

## Building

```sh
npm install
npm run build   # writes main.js
npm run lint
```

Push a tag that matches the version in `manifest.json` (for example `1.0.0`) and the release workflow builds and publishes the release.
