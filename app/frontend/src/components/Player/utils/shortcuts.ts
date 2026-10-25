// Elements where typing (or arrow keys) belongs to the element, not the player.
const TEXT_ENTRY =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"], [role="combobox"], [role="searchbox"], [role="slider"], [role="spinbutton"]';

// Elements that activate themselves on Space/Enter: the player must not also
// act on the same key press.
const SELF_ACTIVATING = 'button, a[href], summary, [role="button"]';

// The player surface is a role="button" div that has no native activation, so
// the player's own handler is the one that should act on it.
const PLAYER_SURFACE = "[data-player-surface]";

const elementOf = (target: EventTarget | null): Element | null =>
  target instanceof Element ? target : null;

/**
 * Whether a keydown must be left alone by the player shortcuts: browser and
 * OS combinations (Ctrl/Cmd+F, Alt+Left, ...), IME composition, text entry,
 * and Space on something that activates itself.
 */
export const shouldIgnoreShortcut = (e: KeyboardEvent): boolean => {
  if (e.defaultPrevented || e.isComposing) return true;
  if (e.ctrlKey || e.metaKey || e.altKey) return true;

  const element = elementOf(e.target);
  if (!element) return false;
  if (element.closest(TEXT_ENTRY)) return true;
  if (
    (e.code === "Space" || e.code === "Enter") &&
    element.closest(SELF_ACTIVATING) &&
    !element.closest(PLAYER_SURFACE)
  ) {
    return true;
  }
  return false;
};
