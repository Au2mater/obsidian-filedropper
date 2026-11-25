import { Editor, FileSystemAdapter, MarkdownFileInfo, MarkdownView, Platform, Plugin, TFile, normalizePath } from "obsidian";

/**
 * Drop a file from outside Obsidian into a note and get a clickable link to the file where it
 * already lives, instead of Obsidian copying it into the vault as an attachment.
 *
 * Hold Ctrl (Option on macOS) while dropping to get Obsidian's normal behaviour (copy into the
 * vault). That is the "copy" modifier in Explorer and Finder too; Shift would mean "move" there.
 */
export default class FileDropperPlugin extends Plugin {
  onload() {
    this.registerEvent(this.app.workspace.on("editor-drop", (evt, editor, info) => this.onDrop(evt, editor, info)));
  }

  private onDrop(evt: DragEvent, editor: Editor, info: MarkdownView | MarkdownFileInfo) {
    if (evt.defaultPrevented || (Platform.isMacOS ? evt.altKey : evt.ctrlKey)) return;
    const files = Array.from(evt.dataTransfer?.files ?? []);
    if (files.length === 0) return;

    const paths = files.map(getNativePath);
    // If we cannot see a real path for every file (e.g. dragged out of a browser or an email),
    // leave it to Obsidian's default handling.
    if (paths.some((p) => !p)) return;

    evt.preventDefault();

    const sourcePath = info.file?.path ?? "";
    const links = (paths as string[]).map((p) => this.linkFor(p, sourcePath));
    const text = links.join(links.length > 1 ? "\n" : "");

    // Put the cursor where the file was dropped, then insert there.
    const cm = (editor as unknown as { cm?: { posAtCoords(c: { x: number; y: number }): number | null } }).cm;
    const offset = cm?.posAtCoords({ x: evt.clientX, y: evt.clientY });
    if (offset != null) editor.setCursor(editor.offsetToPos(offset));
    editor.replaceSelection(text);
  }

  /** A vault-internal file gets a normal Obsidian link; anything else gets a file:/// link. */
  private linkFor(nativePath: string, sourcePath: string): string {
    const vaultFile = this.vaultFileFor(nativePath);
    if (vaultFile) return this.app.fileManager.generateMarkdownLink(vaultFile, sourcePath);
    return `[${escapeLinkText(basename(nativePath))}](<${toFileUrl(nativePath)}>)`;
  }

  private vaultFileFor(nativePath: string): TFile | null {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) return null;
    const base = adapter.getBasePath().replace(/\\/g, "/").replace(/\/+$/, "");
    const p = nativePath.replace(/\\/g, "/");
    const caseInsensitive = /^[a-zA-Z]:\//.test(p); // Windows
    const [pp, bb] = caseInsensitive ? [p.toLowerCase(), base.toLowerCase()] : [p, base];
    if (!pp.startsWith(bb + "/")) return null;
    const rel = normalizePath(p.slice(base.length + 1));
    const f = this.app.vault.getAbstractFileByPath(rel);
    // Folders and unindexed files (e.g. hidden ones) fall through to a file:/// link.
    return f instanceof TFile ? f : null;
  }
}

/** Real filesystem path of a dropped File. Electron 32+ removed File.path; use webUtils instead. */
function getNativePath(file: File): string | null {
  try {
    const electron = require("electron") as { webUtils?: { getPathForFile(f: File): string } };
    const p = electron.webUtils?.getPathForFile(file);
    if (p) return p;
  } catch {
    // fall through
  }
  const legacy = (file as File & { path?: string }).path;
  return legacy || null;
}

function basename(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

function escapeLinkText(s: string): string {
  return s.replace(/([[\]\\])/g, "\\$1");
}

/**
 * C:\Users\Me\a b.pdf -> file:///C:/Users/Me/a b.pdf
 * \\server\share\x    -> file://server/share/x
 * /home/me/x          -> file:///home/me/x
 * Spaces and parentheses are kept readable (the link uses <...>); only characters that would
 * break the URL or the Markdown are percent-encoded.
 */
function toFileUrl(p: string): string {
  const enc = (s: string) => s.replace(/[%#?<>\s]/g, (c) => (c === " " ? " " : encodeURIComponent(c)));
  if (p.startsWith("\\\\")) return "file://" + enc(p.slice(2).replace(/\\/g, "/"));
  const fwd = p.replace(/\\/g, "/");
  return "file://" + (fwd.startsWith("/") ? "" : "/") + enc(fwd);
}
