const CARD_PHASES = new Set(["update_available", "downloading", "downloaded", "installing"]);

export function showUpdateCard(snapshot: { prompt: boolean; phase: string } | null): boolean {
  return Boolean(snapshot && snapshot.prompt && CARD_PHASES.has(snapshot.phase));
}

export function formatMegabytes(bytes: number): string | null {
  if (!(bytes > 0)) {
    return null;
  }
  const megabytes = bytes / (1024 * 1024);
  if (megabytes >= 10) {
    return String(Math.round(megabytes));
  }
  if (megabytes >= 0.1) {
    return megabytes.toFixed(1);
  }
  return "0.1";
}
