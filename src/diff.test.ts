import { test, expect, describe } from "bun:test";
import { hasChanged, generateDiff, diffToHtml } from "./diff.ts";

describe("hasChanged", () => {
  test("returns false for identical strings", () => {
    expect(hasChanged("hello", "hello")).toBe(false);
    expect(hasChanged("", "")).toBe(false);
  });

  test("returns true for different strings", () => {
    expect(hasChanged("hello", "world")).toBe(true);
    expect(hasChanged("", "something")).toBe(true);
    expect(hasChanged("line1\nline2", "line1\nline3")).toBe(true);
  });

  test("is whitespace-sensitive", () => {
    expect(hasChanged("hello ", "hello")).toBe(true);
    expect(hasChanged("hello\n", "hello")).toBe(true);
  });
});

describe("generateDiff", () => {
  test("produces unified diff format", () => {
    const diff = generateDiff("line1\nline2\n", "line1\nline3\n", "test-cmd");
    expect(diff).toContain("---");
    expect(diff).toContain("+++");
    expect(diff).toContain("-line2");
    expect(diff).toContain("+line3");
  });

  test("includes command name", () => {
    const diff = generateDiff("a", "b", "my-command");
    expect(diff).toContain("my-command");
  });

  test("shows no changes for identical input", () => {
    const diff = generateDiff("same\n", "same\n", "cmd");
    // Unified diff with no changes should not contain +/- content lines
    expect(diff).not.toContain("+same");
    expect(diff).not.toContain("-same");
  });

  test("handles empty strings", () => {
    const diff = generateDiff("", "new content\n", "cmd");
    expect(diff).toContain("+new content");
  });

  test("handles multiline changes", () => {
    const old = "line1\nline2\nline3\n";
    const next = "line1\nchanged\nline3\n";
    const diff = generateDiff(old, next, "cmd");
    expect(diff).toContain("-line2");
    expect(diff).toContain("+changed");
  });
});

describe("diffToHtml", () => {
  test("wraps output in pre tag", () => {
    const html = diffToHtml("some diff text");
    expect(html).toStartWith("<pre");
    expect(html).toEndWith("</pre>");
  });

  test("colors addition lines green", () => {
    const html = diffToHtml("+added line");
    expect(html).toContain("color:#22863a");
    expect(html).toContain("+added line");
  });

  test("colors removal lines red", () => {
    const html = diffToHtml("-removed line");
    expect(html).toContain("color:#cb2431");
    expect(html).toContain("-removed line");
  });

  test("colors hunk headers purple", () => {
    const html = diffToHtml("@@ -1,3 +1,3 @@");
    expect(html).toContain("color:#6f42c1");
  });

  test("does not color --- and +++ header lines as additions/removals", () => {
    const html = diffToHtml("--- previous\n+++ current");
    // These should be plain (escaped), not wrapped in green/red spans
    expect(html).not.toContain("color:#22863a");
    expect(html).not.toContain("color:#cb2431");
  });

  test("escapes HTML entities", () => {
    const html = diffToHtml("+<script>alert('xss')</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  test("escapes ampersands and quotes", () => {
    const html = diffToHtml('+foo & "bar"');
    expect(html).toContain("&amp;");
    expect(html).toContain("&quot;");
  });
});
