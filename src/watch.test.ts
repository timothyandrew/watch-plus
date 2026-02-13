import { test, expect, describe } from "bun:test";
import { stripAnsi, truncateLine, highlightDiffs } from "./watch.ts";

describe("stripAnsi", () => {
  test("strips color codes", () => {
    expect(stripAnsi("\x1b[31mred\x1b[0m")).toBe("red");
    expect(stripAnsi("\x1b[1;32mbold green\x1b[0m")).toBe("bold green");
  });

  test("strips multiple escape sequences", () => {
    expect(stripAnsi("\x1b[1m\x1b[31mhello\x1b[0m \x1b[34mworld\x1b[0m")).toBe(
      "hello world",
    );
  });

  test("returns plain text unchanged", () => {
    expect(stripAnsi("hello world")).toBe("hello world");
    expect(stripAnsi("")).toBe("");
  });

  test("strips OSC sequences (title sequences)", () => {
    expect(stripAnsi("\x1b]0;window title\x07some text")).toBe("some text");
  });

  test("handles bold, underline, etc.", () => {
    expect(stripAnsi("\x1b[1mbold\x1b[0m")).toBe("bold");
    expect(stripAnsi("\x1b[4munderline\x1b[0m")).toBe("underline");
    expect(stripAnsi("\x1b[7mreverse\x1b[0m")).toBe("reverse");
  });
});

describe("truncateLine", () => {
  test("truncates plain text at maxWidth", () => {
    expect(truncateLine("hello world", 5)).toBe("hello");
    expect(truncateLine("abcdef", 3)).toBe("abc");
  });

  test("returns full string when shorter than maxWidth", () => {
    expect(truncateLine("hi", 10)).toBe("hi");
    expect(truncateLine("", 5)).toBe("");
  });

  test("returns full string when exactly maxWidth", () => {
    expect(truncateLine("hello", 5)).toBe("hello");
  });

  test("preserves ANSI codes without counting them toward width", () => {
    // "red" is 3 display chars, but the ANSI codes add bytes
    const colored = "\x1b[31mred\x1b[0m text";
    const truncated = truncateLine(colored, 3);
    // Should include "red" and its ANSI codes, but not " text"
    expect(stripAnsi(truncated)).toBe("red");
  });

  test("handles ANSI codes at truncation boundary", () => {
    const colored = "\x1b[31mhello\x1b[0m";
    expect(truncateLine(colored, 3)).toBe("\x1b[31mhel");
  });

  test("handles zero width", () => {
    expect(truncateLine("hello", 0)).toBe("");
  });
});

describe("highlightDiffs", () => {
  const REVERSE = "\x1b[7m";
  const RESET = "\x1b[0m";

  test("highlights changed lines", () => {
    const result = highlightDiffs(
      ["line1", "old"],
      ["line1", "new"],
      false,
      new Set(),
    );
    const lines = result.split("\n");
    expect(lines[0]).toBe("line1"); // unchanged
    expect(lines[1]).toBe(`${REVERSE}new${RESET}`); // changed
  });

  test("no highlighting when lines are identical", () => {
    const result = highlightDiffs(
      ["same", "same"],
      ["same", "same"],
      false,
      new Set(),
    );
    expect(result).toBe("same\nsame");
    expect(result).not.toContain(REVERSE);
  });

  test("handles added lines (new output longer)", () => {
    const result = highlightDiffs(
      ["line1"],
      ["line1", "line2"],
      false,
      new Set(),
    );
    const lines = result.split("\n");
    expect(lines[0]).toBe("line1");
    expect(lines[1]).toBe(`${REVERSE}line2${RESET}`);
  });

  test("handles removed lines (old output longer)", () => {
    const result = highlightDiffs(
      ["line1", "line2"],
      ["line1"],
      false,
      new Set(),
    );
    const lines = result.split("\n");
    expect(lines[0]).toBe("line1");
    // line2 was removed, new line is "" which differs from "line2"
    expect(lines[1]).toBe(`${REVERSE}${RESET}`);
  });

  test("permanent mode accumulates highlights", () => {
    const highlights = new Set<number>();

    // First change: line 1 changes
    highlightDiffs(["a", "b"], ["a", "X"], true, highlights);
    expect(highlights.has(1)).toBe(true);

    // Second change: line 0 changes, line 1 reverts
    const result = highlightDiffs(["a", "X"], ["Y", "b"], true, highlights);
    expect(highlights.has(0)).toBe(true);
    expect(highlights.has(1)).toBe(true); // still highlighted from before

    const lines = result.split("\n");
    // Both lines should be highlighted in permanent mode
    expect(lines[0]).toBe(`${REVERSE}Y${RESET}`);
    expect(lines[1]).toBe(`${REVERSE}b${RESET}`);
  });

  test("non-permanent mode only highlights current changes", () => {
    const highlights = new Set<number>();

    // Line 1 changed
    const result = highlightDiffs(
      ["same", "old"],
      ["same", "new"],
      false,
      highlights,
    );
    const lines = result.split("\n");
    expect(lines[0]).toBe("same");
    expect(lines[1]).toBe(`${REVERSE}new${RESET}`);
  });
});
