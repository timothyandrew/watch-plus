import { homedir } from "os";
import { join } from "path";
import type { Config, WatchOptions } from "./types.ts";

const CONFIG_DIR = join(homedir(), ".watch+");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export async function loadConfig(): Promise<Config> {
  try {
    return await Bun.file(CONFIG_PATH).json();
  } catch {
    return {};
  }
}

export async function saveConfig(config: Config): Promise<void> {
  const { mkdirSync } = await import("fs");
  mkdirSync(CONFIG_DIR, { recursive: true });
  await Bun.write(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}

export function parseDuration(str: string): number {
  const match = str.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h)?$/i);
  if (!match) throw new Error(`Invalid duration: "${str}"`);
  const value = parseFloat(match[1]!);
  const unit = (match[2] || "s").toLowerCase();
  switch (unit) {
    case "ms":
      return value;
    case "s":
      return value * 1000;
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    default:
      throw new Error(`Unknown duration unit: "${unit}"`);
  }
}

interface CliFlags {
  interval?: string;
  differences?: boolean | string;
  errexit?: boolean;
  chgexit?: boolean;
  color?: boolean;
  noColor?: boolean;
  noTitle?: boolean;
  noWrap?: boolean;
  exec?: boolean;
  precise?: boolean;
  beep?: boolean;
  email?: string;
  from?: string;
  cooldown?: string;
  subject?: string;
  apiKey?: string;
}

export function resolveOptions(
  cli: CliFlags,
  config: Config,
  commandArgs: string[]
): WatchOptions {
  const interval = cli.interval
    ? parseFloat(cli.interval)
    : (config.defaultInterval ?? 2);

  const cooldownStr =
    cli.cooldown ?? config.defaultCooldown ?? "1m";
  const cooldown = parseDuration(cooldownStr);

  const resendApiKey =
    cli.apiKey ??
    process.env.RESEND_API_KEY ??
    config.resendApiKey;

  const email = cli.email ?? config.defaultTo;
  const from = cli.from ?? config.defaultFrom;

  let differences: boolean | "permanent" = false;
  if (cli.differences === "permanent" || cli.differences === "cumulative") {
    differences = "permanent";
  } else if (cli.differences !== undefined && cli.differences !== false) {
    differences = true;
  }

  return {
    command: commandArgs,
    interval,
    differences,
    errexit: cli.errexit ?? false,
    chgexit: cli.chgexit ?? false,
    color: cli.color ?? false,
    noColor: cli.noColor ?? false,
    noTitle: cli.noTitle ?? false,
    noWrap: cli.noWrap ?? false,
    exec: cli.exec ?? false,
    precise: cli.precise ?? false,
    beep: cli.beep ?? false,
    email,
    from,
    cooldown,
    subject: cli.subject,
    resendApiKey,
  };
}
