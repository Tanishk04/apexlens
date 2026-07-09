/** Platform detection for shortcut labels (handler accepts Ctrl and Cmd alike). */
const platform =
  (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ??
  navigator.platform ??
  '';

export const IS_MAC = /mac/i.test(platform);

/** e.g. shortcutLabel('K') → "⌘ K" on macOS, "Ctrl K" elsewhere. */
export function shortcutLabel(key: string): string {
  return IS_MAC ? `⌘ ${key}` : `Ctrl ${key}`;
}
