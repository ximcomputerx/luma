const MARKDOWN_EXTENSION = /\.(md|markdown|mdown|mkdn)$/i;

export function isMarkdownPath(path: string): boolean {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  return MARKDOWN_EXTENSION.test(name);
}
