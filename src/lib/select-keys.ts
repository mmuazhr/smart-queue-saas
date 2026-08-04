// =============================================================================
// Select keyboard navigation — the pure half of <Select>, so the ARIA listbox
// behaviour is testable without a DOM renderer.
// =============================================================================
// The highlight is clamped rather than wrapped: a menu that jumps from the last
// row back to the first is easy to overshoot with a held arrow key.

export interface SelectKeyState {
  isOpen: boolean;
  /** Row the arrow keys are sitting on; -1 when nothing is highlighted. */
  highlightedIndex: number;
}

export interface SelectKeyResult extends SelectKeyState {
  /** Row to commit as the new value, or null when this key committed nothing. */
  commitIndex: number | null;
  /** True when the component consumed the key and the caller should preventDefault. */
  handled: boolean;
}

function clamp(index: number, optionCount: number): number {
  return Math.min(Math.max(index, 0), optionCount - 1);
}

/**
 * Next open/highlight state for a keypress on the closed button or the open
 * listbox. Unhandled keys (typing, Tab) leave the state untouched so the
 * browser keeps its default behaviour.
 */
export function selectKeyReducer(
  state: SelectKeyState,
  key: string,
  optionCount: number
): SelectKeyResult {
  const unhandled: SelectKeyResult = { ...state, commitIndex: null, handled: false };
  if (optionCount <= 0) return unhandled;

  switch (key) {
    case "ArrowDown":
    case "ArrowUp": {
      const step = key === "ArrowDown" ? 1 : -1;
      // Opening never moves the highlight — the first press just reveals the
      // list with the current selection under the cursor.
      const next = state.isOpen ? clamp(state.highlightedIndex + step, optionCount) : clamp(state.highlightedIndex, optionCount);
      return { isOpen: true, highlightedIndex: next, commitIndex: null, handled: true };
    }
    case "Enter":
    case " ": {
      if (!state.isOpen) {
        return {
          isOpen: true,
          highlightedIndex: clamp(state.highlightedIndex, optionCount),
          commitIndex: null,
          handled: true,
        };
      }
      const index = clamp(state.highlightedIndex, optionCount);
      return { isOpen: false, highlightedIndex: index, commitIndex: index, handled: true };
    }
    case "Escape": {
      if (!state.isOpen) return unhandled;
      return { isOpen: false, highlightedIndex: state.highlightedIndex, commitIndex: null, handled: true };
    }
    case "Tab": {
      // Let focus leave, but never leave an orphaned popover behind.
      return { isOpen: false, highlightedIndex: state.highlightedIndex, commitIndex: null, handled: false };
    }
    default:
      return unhandled;
  }
}
