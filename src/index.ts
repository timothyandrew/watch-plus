#!/usr/bin/env bun

import { Command } from "commander";
import { loadConfig, resolveOptions } from "./config.ts";
import { startWatch } from "./watch.ts";
import { getGitHubToken } from "./gist.ts";

const VERSION = "1.0.0";

const program = new Command();

program
  .name("watch+")
  .description("Like GNU watch, but emails you when output changes")
  .version(VERSION)
  .argument("<command...>", "Command to run repeatedly")
  .option("-n, --interval <secs>", "seconds to wait between updates", "2")
  .option(
    "-d, --differences [permanent]",
    "highlight changes (use 'permanent' to accumulate)"
  )
  .option("-e, --errexit", "exit on command error", false)
  .option("-g, --chgexit", "exit when output changes", false)
  .option("-c, --color", "pass through ANSI color sequences", false)
  .option("-C, --no-color", "strip ANSI color sequences")
  .option("-t, --no-title", "suppress header")
  .option("-w, --no-wrap", "truncate long lines instead of wrapping")
  .option("-x, --exec", "pass command to exec instead of sh -c", false)
  .option("-p, --precise", "attempt precise timing", false)
  .option("-b, --beep", "beep on command error or change", false)
  .option("--email <address>", "email address to notify on change")
  .option("--to <address>", "alias for --email")
  .option("--from <address>", "sender email address")
  .option(
    "--cooldown <duration>",
    'minimum time between emails (e.g. "30s", "5m")',
    "1m"
  )
  .option("--subject <text>", "custom email subject")
  .option("--api-key <key>", "Resend API key")
  .option("--gist", "write output to a new private GitHub Gist")
  .option("--gist-id <id>", "write output to an existing GitHub Gist")
  .allowUnknownOption(false)
  .action(async (commandArgs: string[], cliOpts) => {
    const config = await loadConfig();

    // --to is an alias for --email
    if (cliOpts.to && !cliOpts.email) {
      cliOpts.email = cliOpts.to;
    }

    const opts = resolveOptions(cliOpts, config, commandArgs);

    // Validate email configuration
    if (opts.email) {
      if (!opts.resendApiKey) {
        console.error(
          "watch+: --email requires a Resend API key.\n" +
            "Set RESEND_API_KEY env var, use --api-key, or add to ~/.watch+/config.json"
        );
        process.exit(1);
      }
      if (!opts.from) {
        console.error(
          "watch+: --email requires --from (sender address).\n" +
            "Use --from or set defaultFrom in ~/.watch+/config.json"
        );
        process.exit(1);
      }
    }

    // Validate gist configuration
    if (opts.gist && opts.gistId) {
      console.error("watch+: --gist and --gist-id are mutually exclusive.");
      process.exit(1);
    }

    if (opts.gist || opts.gistId) {
      try {
        opts.ghToken = await getGitHubToken();
      } catch (err) {
        console.error(
          err instanceof Error ? err.message : String(err),
        );
        process.exit(1);
      }
    }

    await startWatch(opts);
  });

program.parse();
