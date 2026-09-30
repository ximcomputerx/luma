export function hasUnsavedChanges(path: string | null, buffer: string, accepted: string): boolean {
  if (path === null) {
    return buffer.length > 0;
  }
  return buffer !== accepted;
}
