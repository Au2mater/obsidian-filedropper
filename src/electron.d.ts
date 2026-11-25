// The part of Electron's renderer API this plugin uses. Obsidian provides "electron" at runtime;
// the full electron package is not installed because it would download an Electron binary.
declare module "electron" {
  /** Undefined on Electron versions before 29, where File.path is used instead. */
  export const webUtils: { getPathForFile(file: File): string } | undefined;
}
