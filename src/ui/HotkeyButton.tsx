import { hotkeyTooltip, underlineIndex } from "./hotkeys";

export function HotkeyLabel({ label, letter }: { label: string; letter: string }) {
  const i = underlineIndex(label, letter);
  if (i < 0) {
    return (
      <>
        {label} (<u>{letter.toUpperCase()}</u>)
      </>
    );
  }
  return (
    <>
      {label.slice(0, i)}
      <u>{label[i]}</u>
      {label.slice(i + 1)}
    </>
  );
}

export function HotkeyButton({
  label,
  letter,
  title,
  className,
  onClick,
  active,
}: {
  label: string;
  letter: string;
  /** Extra hint after `Label (X)`. */
  title?: string;
  className?: string;
  onClick: () => void;
  active?: boolean;
}) {
  const named = hotkeyTooltip(label, letter);
  const tip = title && title !== named ? `${named}. ${title}` : named;
  return (
    <button
      type="button"
      className={`${active ? "active " : ""}${className ?? ""}`.trim()}
      title={tip}
      data-hotkey={letter.toUpperCase()}
      onClick={onClick}
    >
      <HotkeyLabel label={label} letter={letter} />
    </button>
  );
}
