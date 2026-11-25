import { webUtils } from "electron";
import { Editor, FileSystemAdapter, EditorPosition, MarkdownFileInfo, MarkdownView, Notice, Platform, Plugin, TFile, normalizePath } from "obsidian";

/**
 * Drop a file from outside Obsidian into a note and get a clickable link to the file where it
 * already lives, instead of Obsidian copying it into the vault as an attachment.
 *
 * Hold Ctrl (Option on macOS) while dropping to copy the file into the vault's attachment folder
 * instead. That is the "copy" modifier in Explorer and Finder too; Shift would mean "move" there.
 * The plugin does the copy itself, because Obsidian's own Ctrl/Option drop inserts a file:// link.
 */
export default class FileDropperPlugin extends Plugin {
  onload() {
    this.registerEvent(this.app.workspace.on("editor-drop", (evt, editor, info) => this.onDrop(evt, editor, info)));
  }

  private onDrop(evt: DragEvent, editor: Editor, info: MarkdownView | MarkdownFileInfo) {
    if (evt.defaultPrevented) return;
    const files = Array.from(evt.dataTransfer?.files ?? []);
    if (files.length === 0) return;
    const sourcePath = info.file?.path ?? "";

    if (Platform.isMacOS ? evt.altKey : evt.ctrlKey) {
      evt.preventDefault();
      const pos = dropPosition(editor, evt);
      void this.copyIntoVault(files, sourcePath).then((links) => insertAt(editor, pos, links));
      return;
    }

    const paths = files.map(getNativePath);
    // If we cannot see a real path for every file (e.g. dragged out of a browser or an email),
    // leave it to Obsidian's default handling.
    if (paths.some((p) => !p)) return;

    evt.preventDefault();
    const links = (paths as string[]).map((p) => this.linkFor(p, sourcePath));
    insertAt(editor, dropPosition(editor, evt), links);
  }

  /** Copy dropped files into the attachment folder, as Obsidian's plain drop would. */
  private async copyIntoVault(files: File[], sourcePath: string): Promise<string[]> {
    const links: string[] = [];
    for (const file of files) {
      try {
        const path = await this.app.fileManager.getAvailablePathForAttachment(file.name, sourcePath);
        if (isHidden(path)) throw new HiddenFolderError(path);
        const created = await this.app.vault.createBinary(path, await file.arrayBuffer());
        const link = this.app.fileManager.generateMarkdownLink(created, sourcePath);
        // Like Obsidian's own drop: embed what Obsidian can show inline, link the rest.
        links.push(EMBEDDABLE.test(created.extension) ? "!" + link : link);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        // Obsidian does not index folders whose name starts with a dot. Saving into one either fails
        // with "Folder already exists" or gives a link Obsidian cannot resolve.
        const hint =
          e instanceof HiddenFolderError || /folder already exists/i.test(message)
            ? " Your attachment folder looks hidden (its name starts with a dot). Pick a folder name without a leading dot under Settings → Files and links."
            : "";
        new Notice(`File Dropper: could not copy ${file.name} into the vault: ${message}.${hint}`, hint ? 15000 : undefined);
        break;
      }
    }
    return links;
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
    const p = webUtils?.getPathForFile(file);
    if (p) return p;
  } catch {
    // fall through
  }
  const legacy = (file as File & { path?: string }).path;
  return legacy || null;
}

class HiddenFolderError extends Error {
  constructor(path: string) {
    super(`"${path}" is inside a hidden folder`);
  }
}

function isHidden(vaultPath: string): boolean {
  return vaultPath.split("/").slice(0, -1).some((part) => part.startsWith("."));
}

const EMBEDDABLE = /^(avif|bmp|gif|jpe?g|png|svg|webp|mp3|webm|wav|m4a|ogg|3gp|flac|mp4|ogv|mov|mkv|pdf)$/i;

/** Editor position under the mouse, or null to use the cursor. */
function dropPosition(editor: Editor, evt: DragEvent): EditorPosition | null {
  const cm = (editor as unknown as { cm?: { posAtCoords(c: { x: number; y: number }): number | null } }).cm;
  const offset = cm?.posAtCoords({ x: evt.clientX, y: evt.clientY });
  return offset != null ? editor.offsetToPos(offset) : null;
}

function insertAt(editor: Editor, pos: EditorPosition | null, links: string[]) {
  if (links.length === 0) return;
  if (pos) editor.setCursor(pos);
  editor.replaceSelection(links.join("\n"));
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
