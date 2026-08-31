import type { Tool } from "../model/types";

export type HotkeyAction =
  | { kind: "tool"; tool: Tool }
  | { kind: "fill" }
  | { kind: "ortho" };

/** Anthony’s map. First unused letter of an unlisted button is assigned at the call site. */
export const TOOL_HOTKEY = {
  select: "V",
  pan: "H",
  scale: "S",
  origin: "O",
  measure: "M",
  outline: "D",
  ledger: "L",
  houseWall: "W",
  post: "P",
  beam: "B",
  joist: "J",
  breaker: "K",
  blocking: "X",
  rim: "R",
  guard: "G",
  nodigZone: "N",
  nodigPoint: "U",
  box: "T",
} as const satisfies Partial<Record<Tool, string>>;

export const FILL_HOTKEY = "F";
export const ORTHO_HOTKEY = "A";

const RESERVED = new Set<string>(
  [...Object.values(TOOL_HOTKEY), FILL_HOTKEY, ORTHO_HOTKEY].map((c) => c.toLowerCase()),
);

const BY_LETTER = new Map<string, HotkeyAction>();
for (const [tool, letter] of Object.entries(TOOL_HOTKEY)) {
  BY_LETTER.set(letter.toLowerCase(), { kind: "tool", tool: tool as Tool });
}
BY_LETTER.set(FILL_HOTKEY.toLowerCase(), { kind: "fill" });
BY_LETTER.set(ORTHO_HOTKEY.toLowerCase(), { kind: "ortho" });

export function hotkeyLetterForTool(tool: Tool): string | undefined {
  return TOOL_HOTKEY[tool as keyof typeof TOOL_HOTKEY];
}

export function hotkeyTooltip(label: string, letter: string): string {
  return `${label} (${letter.toUpperCase()})`;
}

/** Index of the underlined letter in `label`, or -1 if the letter is appended as (X). */
export function underlineIndex(label: string, letter: string): number {
  return label.toLowerCase().indexOf(letter.toLowerCase());
}

export function isTypingTarget(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Resolve a keydown to a tool/fill/ortho action.
 * Ignores modifiers so Ctrl/Cmd+S save is not stolen.
 */
export function actionFromKey(key: string, opts: { ctrlOrMeta?: boolean; alt?: boolean } = {}): HotkeyAction | null {
  if (opts.ctrlOrMeta || opts.alt) return null;
  if (key.length !== 1) return null;
  return BY_LETTER.get(key.toLowerCase()) ?? null;
}

/** First unused letter of an unlisted button label (A–Z). */
export function firstUnusedLetter(label: string, extraUsed: string[] = []): string {
  const used = new Set([...RESERVED, ...extraUsed.map((c) => c.toLowerCase())]);
  for (const ch of label) {
    if (/[a-z]/i.test(ch) && !used.has(ch.toLowerCase())) return ch.toUpperCase();
  }
  for (const ch of "CZEIQY") {
    if (!used.has(ch.toLowerCase())) return ch;
  }
  return "Z";
}
