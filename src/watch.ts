import { hostname } from "os";
import type { WatchOptions, ExecutionResult } from "./types.ts";
import { hasChanged } from "./diff.ts";
import { createEmailSender } from "./email.ts";

// ANSI helpers
const ESC = "\x1b";
const ALT_SCREEN_ON = `${ESC}[?1049h`;
const ALT_SCREEN_OFF = `${ESC}[?1049l`;
const CURSOR_HIDE = `${ESC}[?25l`;
const CURSOR_SHOW = `${ESC}[?25h`;
const CLEAR_SCREEN = `${ESC}[2J`;
const CURSOR_HOME = `${ESC}[H`;
const BOLD = `${ESC}[1m`;
const REVERSE = `${ESC}[7m`;
const RESET = `${ESC}[0m`;
const BELL = "\x07";

// Strip ANSI escape sequences for comparison
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/\x1b\][^\x07]*\x07/g, "");
}

function getTerminalSize(): { cols: number; rows: number } {
  return {
    cols: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
  };
}

function executeCommand(opts: WatchOptions): ExecutionResult {
  const start = performance.now();

  let result;
  if (opts.exec) {
    result = Bun.spawnSync(opts.command, {
      stdout: "pipe",
      stderr: "pipe",
    });
  } else {
    const cmd = opts.command.join(" ");
    result = Bun.spawnSync(["sh", "-c", cmd], {
      stdout: "pipe",
      stderr: "pipe",
    });
  }

  const duration = performance.now() - start;
  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    exitCode: result.exitCode,
    duration,
  };
}

function formatHeader(opts: WatchOptions): string {
  const cmd = opts.exec ? opts.command.join(" ") : opts.command.join(" ");
  const host = hostname();
  const now = new Date().toLocaleString();
  const left = `Every ${opts.interval.toFixed(1)}s: ${cmd}`;
  const right = `${host}: ${now}`;
  const { cols } = getTerminalSize();
  const padding = Math.max(1, cols - left.length - right.length);
  return `${BOLD}${left}${" ".repeat(padding)}${right}${RESET}\n\n`;
}

function truncateLine(line: string, maxWidth: number): string {
  // We need to handle ANSI codes — they have zero display width
  let displayWidth = 0;
  let result = "";
  let inEscape = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === "\x1b") {
      inEscape = true;
      result += ch;
      continue;
    }
    if (inEscape) {
      result += ch;
      if (/[a-zA-Z]/.test(ch)) inEscape = false;
      continue;
    }
    if (displayWidth >= maxWidth) break;
    result += ch;
    displayWidth++;
  }
  return result;
}

function renderOutput(
  output: string,
  opts: WatchOptions,
  headerLines: number
): string {
  const { cols, rows } = getTerminalSize();
  const availableRows = rows - headerLines;
  let lines = output.split("\n");

  // Remove colors if --no-color
  if (opts.noColor) {
    lines = lines.map(stripAnsi);
  }

  // Truncate or wrap lines
  if (opts.noWrap) {
    lines = lines.map((l) => truncateLine(l, cols));
  }

  // Limit to available rows
  if (lines.length > availableRows) {
    lines = lines.slice(0, availableRows);
  }

  return lines.join("\n");
}

function highlightDiffs(
  oldLines: string[],
  newLines: string[],
  permanent: boolean,
  permanentHighlights: Set<number>
): string {
  const result: string[] = [];
  const maxLen = Math.max(oldLines.length, newLines.length);

  for (let i = 0; i < maxLen; i++) {
    const oldLine = oldLines[i] ?? "";
    const newLine = newLines[i] ?? "";
    const changed = oldLine !== newLine;

    if (changed) {
      permanentHighlights.add(i);
    }

    const shouldHighlight = permanent
      ? permanentHighlights.has(i)
      : changed;

    if (shouldHighlight && newLine !== undefined) {
      result.push(`${REVERSE}${newLine}${RESET}`);
    } else {
      result.push(newLine ?? "");
    }
  }

  return result.join("\n");
}

export async function startWatch(opts: WatchOptions): Promise<void> {
  // Set up email sender if configured
  let emailSender: ReturnType<typeof createEmailSender> | null = null;
  if (opts.email && opts.resendApiKey) {
    emailSender = createEmailSender(opts.resendApiKey);
  }

  const commandStr = opts.command.join(" ");
  const defaultSubject = `watch+: change detected in '${commandStr}'`;

  let previousOutput: string | null = null;
  let previousStripped: string | null = null;
  const permanentHighlights = new Set<number>();
  let running = true;

  // Terminal setup
  process.stdout.write(ALT_SCREEN_ON + CURSOR_HIDE + CLEAR_SCREEN);

  let cleanedUp = false;
  function cleanup() {
    if (cleanedUp) return;
    cleanedUp = true;
    process.stdout.write(CURSOR_SHOW + ALT_SCREEN_OFF);
    if (process.stdin.isTTY && process.stdin.isRaw) {
      process.stdin.setRawMode(false);
    }
  }

  process.on("SIGINT", () => {
    running = false;
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    running = false;
    cleanup();
    process.exit(0);
  });
  process.on("exit", cleanup);
  process.on("uncaughtException", (err) => {
    cleanup();
    console.error(err);
    process.exit(1);
  });

  // Keypress handling — raw mode on stdin
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", (data: Buffer) => {
      const key = data.toString();
      if (key === "q" || key === "\x03") {
        // q or Ctrl+C
        running = false;
        cleanup();
        process.exit(0);
      }
      if (key === " ") {
        // Space: immediate re-run handled by breaking out of sleep
        // We'll use a flag
        immediateRerun = true;
      }
    });
  }

  let immediateRerun = false;

  while (running) {
    const execResult = executeCommand(opts);
    const currentOutput = execResult.stdout;
    const currentStripped = stripAnsi(currentOutput);

    // Check for change
    const changed =
      previousStripped !== null &&
      hasChanged(previousStripped, currentStripped);

    if (changed) {
      // Beep
      if (opts.beep) {
        process.stdout.write(BELL);
      }

      // Send email notification
      if (emailSender && opts.email && opts.from) {
        emailSender
          .sendChangeNotification({
            to: opts.email,
            from: opts.from,
            subject: opts.subject ?? defaultSubject,
            oldOutput: previousStripped!,
            newOutput: currentStripped,
            command: commandStr,
            cooldownMs: opts.cooldown,
          })
          .catch(() => {});
      }

      // chgexit: exit on change
      if (opts.chgexit) {
        cleanup();
        process.exit(0);
      }
    }

    // errexit: exit on non-zero
    if (opts.errexit && execResult.exitCode !== 0) {
      cleanup();
      process.exit(execResult.exitCode);
    }

    // Render
    process.stdout.write(CURSOR_HOME + CLEAR_SCREEN);

    // Header
    let headerLines = 0;
    if (!opts.noTitle) {
      const header = formatHeader(opts);
      process.stdout.write(header);
      headerLines = 2;
    }

    // Output with optional diff highlighting
    let displayOutput: string;
    if (opts.differences && previousOutput !== null) {
      const oldLines = (opts.color ? previousOutput : previousStripped!).split(
        "\n"
      );
      const newLines = (opts.color ? currentOutput : currentStripped).split(
        "\n"
      );
      displayOutput = highlightDiffs(
        oldLines,
        newLines,
        opts.differences === "permanent",
        permanentHighlights
      );
    } else {
      displayOutput = opts.color ? currentOutput : currentStripped;
    }

    process.stdout.write(renderOutput(displayOutput, opts, headerLines));

    previousOutput = currentOutput;
    previousStripped = currentStripped;

    // Sleep
    const intervalMs = opts.interval * 1000;
    const sleepMs = opts.precise
      ? Math.max(0, intervalMs - execResult.duration)
      : intervalMs;

    // Sleep in small increments so we can respond to keypress
    immediateRerun = false;
    const sleepEnd = Date.now() + sleepMs;
    while (running && !immediateRerun && Date.now() < sleepEnd) {
      await Bun.sleep(Math.min(50, sleepEnd - Date.now()));
    }
  }
}
