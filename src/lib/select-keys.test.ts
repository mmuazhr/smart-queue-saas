import { describe, it, expect } from "vitest";
import { selectKeyReducer, type SelectKeyState } from "./select-keys";

const OPTION_COUNT = 4;
const closed = (highlightedIndex = 0): SelectKeyState => ({ isOpen: false, highlightedIndex });
const open = (highlightedIndex: number): SelectKeyState => ({ isOpen: true, highlightedIndex });

describe("selectKeyReducer — opening", () => {
  it("opens on ArrowDown without moving the highlight", () => {
    expect(selectKeyReducer(closed(2), "ArrowDown", OPTION_COUNT)).toEqual({
      isOpen: true,
      highlightedIndex: 2,
      commitIndex: null,
      handled: true,
    });
  });

  it("opens on ArrowUp without moving the highlight", () => {
    expect(selectKeyReducer(closed(2), "ArrowUp", OPTION_COUNT).highlightedIndex).toBe(2);
  });

  it("opens on Enter and commits nothing", () => {
    const result = selectKeyReducer(closed(1), "Enter", OPTION_COUNT);
    expect(result.isOpen).toBe(true);
    expect(result.commitIndex).toBeNull();
  });

  it("pulls an unset highlight onto the first row when opening", () => {
    expect(selectKeyReducer(closed(-1), "ArrowDown", OPTION_COUNT).highlightedIndex).toBe(0);
  });
});

describe("selectKeyReducer — moving", () => {
  it("moves down and up one row at a time", () => {
    expect(selectKeyReducer(open(1), "ArrowDown", OPTION_COUNT).highlightedIndex).toBe(2);
    expect(selectKeyReducer(open(1), "ArrowUp", OPTION_COUNT).highlightedIndex).toBe(0);
  });

  it("clamps at the last row rather than wrapping", () => {
    expect(selectKeyReducer(open(3), "ArrowDown", OPTION_COUNT).highlightedIndex).toBe(3);
  });

  it("clamps at the first row rather than wrapping", () => {
    expect(selectKeyReducer(open(0), "ArrowUp", OPTION_COUNT).highlightedIndex).toBe(0);
  });
});

describe("selectKeyReducer — committing and closing", () => {
  it("commits the highlighted row on Enter and closes", () => {
    expect(selectKeyReducer(open(2), "Enter", OPTION_COUNT)).toEqual({
      isOpen: false,
      highlightedIndex: 2,
      commitIndex: 2,
      handled: true,
    });
  });

  it("commits on Space as well as Enter", () => {
    expect(selectKeyReducer(open(3), " ", OPTION_COUNT).commitIndex).toBe(3);
  });

  it("closes on Escape without committing", () => {
    const result = selectKeyReducer(open(2), "Escape", OPTION_COUNT);
    expect(result.isOpen).toBe(false);
    expect(result.commitIndex).toBeNull();
    expect(result.handled).toBe(true);
  });

  it("leaves Escape to the page when already closed", () => {
    expect(selectKeyReducer(closed(2), "Escape", OPTION_COUNT).handled).toBe(false);
  });

  // Focus must keep moving, so Tab closes the popover without claiming the key.
  it("closes on Tab but does not consume it", () => {
    const result = selectKeyReducer(open(1), "Tab", OPTION_COUNT);
    expect(result.isOpen).toBe(false);
    expect(result.handled).toBe(false);
  });
});

describe("selectKeyReducer — keys it must not touch", () => {
  it("ignores typing", () => {
    expect(selectKeyReducer(open(1), "a", OPTION_COUNT)).toEqual({
      isOpen: true,
      highlightedIndex: 1,
      commitIndex: null,
      handled: false,
    });
  });

  it("does nothing at all with an empty option list", () => {
    expect(selectKeyReducer(closed(0), "ArrowDown", 0)).toEqual({
      isOpen: false,
      highlightedIndex: 0,
      commitIndex: null,
      handled: false,
    });
  });

  it("clamps a highlight left stale by a shrinking option list", () => {
    expect(selectKeyReducer(open(9), "ArrowDown", OPTION_COUNT).highlightedIndex).toBe(3);
    expect(selectKeyReducer(open(9), "Enter", OPTION_COUNT).commitIndex).toBe(3);
  });
});
