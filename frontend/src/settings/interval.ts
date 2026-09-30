export function autosaveMs(seconds: number): number | null {
  if (!Number.isFinite(seconds)) {
    return null;
  }
  const ms = Math.round(seconds * 1000);
  if (ms < 500 || ms > 10000) {
    return null;
  }
  return ms;
}
