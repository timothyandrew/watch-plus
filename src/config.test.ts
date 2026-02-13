import { test, expect, describe } from "bun:test";
import { parseDuration, resolveOptions } from "./config.ts";
import type { Config } from "./types.ts";

describe("parseDuration", () => {
  test("parses milliseconds", () => {
    expect(parseDuration("500ms")).toBe(500);
    expect(parseDuration("0ms")).toBe(0);
    expect(parseDuration("1ms")).toBe(1);
  });

  test("parses seconds", () => {
    expect(parseDuration("30s")).toBe(30_000);
    expect(parseDuration("1s")).toBe(1_000);
    expect(parseDuration("0.5s")).toBe(500);
  });

  test("parses minutes", () => {
    expect(parseDuration("1m")).toBe(60_000);
    expect(parseDuration("5m")).toBe(300_000);
    expect(parseDuration("0.5m")).toBe(30_000);
  });

  test("parses hours", () => {
    expect(parseDuration("1h")).toBe(3_600_000);
    expect(parseDuration("2h")).toBe(7_200_000);
  });

  test("defaults to seconds when no unit", () => {
    expect(parseDuration("10")).toBe(10_000);
    expect(parseDuration("2.5")).toBe(2_500);
  });

  test("is case insensitive", () => {
    expect(parseDuration("5S")).toBe(5_000);
    expect(parseDuration("1M")).toBe(60_000);
    expect(parseDuration("500MS")).toBe(500);
    expect(parseDuration("1H")).toBe(3_600_000);
  });

  test("throws on invalid input", () => {
    expect(() => parseDuration("")).toThrow("Invalid duration");
    expect(() => parseDuration("abc")).toThrow("Invalid duration");
    expect(() => parseDuration("-5s")).toThrow("Invalid duration");
    expect(() => parseDuration("5x")).toThrow("Invalid duration");
  });
});

describe("resolveOptions", () => {
  const emptyConfig: Config = {};
  const defaultCommand = ["echo", "hello"];

  test("uses defaults when no CLI flags or config", () => {
    const opts = resolveOptions({}, emptyConfig, defaultCommand);
    expect(opts.command).toEqual(defaultCommand);
    expect(opts.interval).toBe(2);
    expect(opts.cooldown).toBe(60_000); // 1m default
    expect(opts.differences).toBe(false);
    expect(opts.errexit).toBe(false);
    expect(opts.chgexit).toBe(false);
    expect(opts.color).toBe(false);
    expect(opts.noColor).toBe(false);
    expect(opts.noTitle).toBe(false);
    expect(opts.noWrap).toBe(false);
    expect(opts.exec).toBe(false);
    expect(opts.precise).toBe(false);
    expect(opts.beep).toBe(false);
    expect(opts.email).toBeUndefined();
    expect(opts.from).toBeUndefined();
    expect(opts.subject).toBeUndefined();
    expect(opts.resendApiKey).toBeUndefined();
  });

  test("CLI interval overrides config", () => {
    const config: Config = { defaultInterval: 5 };
    const opts = resolveOptions({ interval: "10" }, config, defaultCommand);
    expect(opts.interval).toBe(10);
  });

  test("config interval used when no CLI flag", () => {
    const config: Config = { defaultInterval: 5 };
    const opts = resolveOptions({}, config, defaultCommand);
    expect(opts.interval).toBe(5);
  });

  test("CLI cooldown overrides config", () => {
    const config: Config = { defaultCooldown: "10m" };
    const opts = resolveOptions({ cooldown: "30s" }, config, defaultCommand);
    expect(opts.cooldown).toBe(30_000);
  });

  test("config cooldown used when no CLI flag", () => {
    const config: Config = { defaultCooldown: "5m" };
    const opts = resolveOptions({}, config, defaultCommand);
    expect(opts.cooldown).toBe(300_000);
  });

  test("resolves email from CLI", () => {
    const opts = resolveOptions(
      { email: "user@example.com" },
      emptyConfig,
      defaultCommand,
    );
    expect(opts.email).toBe("user@example.com");
  });

  test("resolves email from config", () => {
    const config: Config = { defaultTo: "config@example.com" };
    const opts = resolveOptions({}, config, defaultCommand);
    expect(opts.email).toBe("config@example.com");
  });

  test("CLI email overrides config", () => {
    const config: Config = { defaultTo: "config@example.com" };
    const opts = resolveOptions(
      { email: "cli@example.com" },
      config,
      defaultCommand,
    );
    expect(opts.email).toBe("cli@example.com");
  });

  test("resolves from address", () => {
    const config: Config = { defaultFrom: "default@example.com" };
    const opts = resolveOptions({}, config, defaultCommand);
    expect(opts.from).toBe("default@example.com");

    const opts2 = resolveOptions(
      { from: "cli@example.com" },
      config,
      defaultCommand,
    );
    expect(opts2.from).toBe("cli@example.com");
  });

  test("resolves API key from CLI, then env, then config", () => {
    const config: Config = { resendApiKey: "config-key" };
    const opts = resolveOptions({}, config, defaultCommand);
    expect(opts.resendApiKey).toBe("config-key");

    const opts2 = resolveOptions(
      { apiKey: "cli-key" },
      config,
      defaultCommand,
    );
    expect(opts2.resendApiKey).toBe("cli-key");
  });

  test("differences flag variants", () => {
    // boolean true
    const opts1 = resolveOptions(
      { differences: true },
      emptyConfig,
      defaultCommand,
    );
    expect(opts1.differences).toBe(true);

    // "permanent"
    const opts2 = resolveOptions(
      { differences: "permanent" },
      emptyConfig,
      defaultCommand,
    );
    expect(opts2.differences).toBe("permanent");

    // "cumulative"
    const opts3 = resolveOptions(
      { differences: "cumulative" },
      emptyConfig,
      defaultCommand,
    );
    expect(opts3.differences).toBe("permanent");

    // false / undefined
    const opts4 = resolveOptions({}, emptyConfig, defaultCommand);
    expect(opts4.differences).toBe(false);

    const opts5 = resolveOptions(
      { differences: false },
      emptyConfig,
      defaultCommand,
    );
    expect(opts5.differences).toBe(false);
  });

  test("boolean flags pass through", () => {
    const opts = resolveOptions(
      {
        errexit: true,
        chgexit: true,
        color: true,
        noColor: true,
        noTitle: true,
        noWrap: true,
        exec: true,
        precise: true,
        beep: true,
      },
      emptyConfig,
      defaultCommand,
    );
    expect(opts.errexit).toBe(true);
    expect(opts.chgexit).toBe(true);
    expect(opts.color).toBe(true);
    expect(opts.noColor).toBe(true);
    expect(opts.noTitle).toBe(true);
    expect(opts.noWrap).toBe(true);
    expect(opts.exec).toBe(true);
    expect(opts.precise).toBe(true);
    expect(opts.beep).toBe(true);
  });

  test("subject passes through from CLI", () => {
    const opts = resolveOptions(
      { subject: "Custom subject" },
      emptyConfig,
      defaultCommand,
    );
    expect(opts.subject).toBe("Custom subject");
  });
});
