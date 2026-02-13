import { createPatch } from "diff";

export function hasChanged(oldOutput: string, newOutput: string): boolean {
  return oldOutput !== newOutput;
}

export function generateDiff(
  oldOutput: string,
  newOutput: string,
  command: string
): string {
  return createPatch(command, oldOutput, newOutput, "previous", "current");
}

export function diffToHtml(diffText: string): string {
  const lines = diffText.split("\n");
  const htmlLines = lines.map((line) => {
    const escaped = escapeHtml(line);
    if (line.startsWith("+") && !line.startsWith("+++")) {
      return `<span style="color:#22863a;background:#f0fff4">${escaped}</span>`;
    }
    if (line.startsWith("-") && !line.startsWith("---")) {
      return `<span style="color:#cb2431;background:#ffeef0">${escaped}</span>`;
    }
    if (line.startsWith("@@")) {
      return `<span style="color:#6f42c1">${escaped}</span>`;
    }
    return escaped;
  });

  return `<pre style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:13px;line-height:1.45;padding:16px;overflow:auto;background:#f6f8fa;border-radius:6px">${htmlLines.join("\n")}</pre>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
