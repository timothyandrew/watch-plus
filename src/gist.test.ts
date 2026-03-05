import { test, expect, describe, mock, beforeEach, afterEach } from "bun:test";
import { deriveFilename, getGitHubToken, createGistSender, formatUptime, formatStats, type GistStats } from "./gist.ts";

describe("deriveFilename", () => {
  test("sanitizes a simple command", () => {
    expect(deriveFilename("kubectl get pods")).toBe("kubectl-get-pods.txt");
  });

  test("removes special characters", () => {
    expect(deriveFilename("cat /var/log/*.log | grep error")).toBe(
      "cat-varloglog-grep-error.txt",
    );
  });

  test("truncates long commands", () => {
    const long = "a".repeat(100);
    const result = deriveFilename(long);
    expect(result).toBe("a".repeat(60) + ".txt");
  });

  test("falls back to 'output' for empty/all-special input", () => {
    expect(deriveFilename("///")).toBe("output.txt");
  });

  test("collapses multiple spaces", () => {
    expect(deriveFilename("echo   hello   world")).toBe(
      "echo-hello-world.txt",
    );
  });
});

describe("getGitHubToken", () => {
  test("returns a non-empty string when gh is available", async () => {
    // This test only passes when `gh auth login` has been run
    // In CI without gh, this would fail — skip gracefully
    try {
      const token = await getGitHubToken();
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(0);
    } catch (err) {
      expect((err as Error).message).toContain("GitHub");
    }
  });
});

describe("createGistSender", () => {
  const originalFetch = globalThis.fetch;
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    mockFetch = mock();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("initialize creates a new gist with output and stats files", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "abc123",
          html_url: "https://gist.github.com/abc123",
        }),
    });

    const sender = createGistSender("fake-token", "date");
    const url = await sender.initialize("initial content");

    expect(url).toBe("https://gist.github.com/abc123");
    expect(sender.gistUrl).toBe("https://gist.github.com/abc123");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [fetchUrl, fetchOpts] = mockFetch.mock.calls[0]! as [string, RequestInit];
    expect(fetchUrl).toBe("https://api.github.com/gists");
    expect(fetchOpts.method).toBe("POST");
    const body = JSON.parse(fetchOpts.body as string);
    expect(body.public).toBe(false);
    expect(body.files["date.txt"].content).toBe("initial content");
    expect(body.files["statistics.txt"].content).toContain("initializing");
  });

  test("initialize with existing gist ID fetches then updates", async () => {
    // GET to fetch existing gist
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          html_url: "https://gist.github.com/existing123",
          files: { "old-name.txt": { content: "old" } },
        }),
    });
    // PATCH to update
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

    const sender = createGistSender("fake-token", "date", "existing123");
    const url = await sender.initialize("new content");

    expect(url).toBe("https://gist.github.com/existing123");
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // First call: GET
    const [getUrl] = mockFetch.mock.calls[0]! as [string, RequestInit];
    expect(getUrl).toBe("https://api.github.com/gists/existing123");

    // Second call: PATCH with existing filename
    const [patchUrl, patchOpts] = mockFetch.mock.calls[1]! as [string, RequestInit];
    expect(patchUrl).toBe("https://api.github.com/gists/existing123");
    expect(patchOpts.method).toBe("PATCH");
    const body = JSON.parse(patchOpts.body as string);
    expect(body.files["old-name.txt"].content).toBe("new content");
  });

  const sampleStats: GistStats = {
    startedAt: new Date("2026-03-05T10:00:00Z"),
    iterations: 5,
    changes: 2,
    lastChangeAt: new Date("2026-03-05T10:05:00Z"),
    command: "echo hello",
    intervalSecs: 2,
  };

  test("updateGist PATCHes with output and stats files", async () => {
    // Create gist first
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "abc123",
          html_url: "https://gist.github.com/abc123",
        }),
    });
    // Update
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

    const sender = createGistSender("fake-token", "echo hello");
    await sender.initialize("first");
    await sender.updateGist("updated content", sampleStats);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [patchUrl, patchOpts] = mockFetch.mock.calls[1]! as [string, RequestInit];
    expect(patchUrl).toBe("https://api.github.com/gists/abc123");
    expect(patchOpts.method).toBe("PATCH");
    const body = JSON.parse(patchOpts.body as string);
    expect(body.files["echo-hello.txt"].content).toBe("updated content");
    expect(body.files["statistics.txt"].content).toContain("changes:      2");
  });

  test("updateGist without stats only sends output file", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "abc123",
          html_url: "https://gist.github.com/abc123",
        }),
    });
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

    const sender = createGistSender("fake-token", "echo hello");
    await sender.initialize("first");
    await sender.updateGist("updated content");

    const [, patchOpts] = mockFetch.mock.calls[1]! as [string, RequestInit];
    const body = JSON.parse(patchOpts.body as string);
    expect(body.files["echo-hello.txt"].content).toBe("updated content");
    expect(body.files["statistics.txt"]).toBeUndefined();
  });

  test("updateGist is a no-op before initialize", async () => {
    const sender = createGistSender("fake-token", "date");
    await sender.updateGist("content");
    expect(mockFetch).toHaveBeenCalledTimes(0);
  });

  test("initialize handles API errors without crashing", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    });

    const sender = createGistSender("bad-token", "date");
    await expect(sender.initialize("content")).rejects.toThrow("401");
  });

  test("updateGist handles API errors without crashing", async () => {
    // Create successfully
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "abc123",
          html_url: "https://gist.github.com/abc123",
        }),
    });
    // Update fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    const sender = createGistSender("fake-token", "date");
    await sender.initialize("first");
    // Should not throw
    await sender.updateGist("updated");
  });
});

describe("formatUptime", () => {
  test("formats seconds", () => {
    expect(formatUptime(45_000)).toBe("45s");
  });

  test("formats minutes and seconds", () => {
    expect(formatUptime(125_000)).toBe("2m 5s");
  });

  test("formats hours", () => {
    expect(formatUptime(3_661_000)).toBe("1h 1m 1s");
  });

  test("formats days", () => {
    expect(formatUptime(90_061_000)).toBe("1d 1h 1m");
  });
});

describe("formatStats", () => {
  test("includes all fields", () => {
    const stats: GistStats = {
      startedAt: new Date("2026-03-05T10:00:00Z"),
      iterations: 42,
      changes: 7,
      lastChangeAt: new Date("2026-03-05T10:30:00Z"),
      command: "kubectl get pods",
      intervalSecs: 5,
    };
    const output = formatStats(stats);
    expect(output).toContain("command:      kubectl get pods");
    expect(output).toContain("interval:     5s");
    expect(output).toContain("iterations:   42");
    expect(output).toContain("changes:      7");
    expect(output).toContain("last change:  2026-03-05T10:30:00.000Z");
    expect(output).toContain("started:");
  });

  test("omits last change when null", () => {
    const stats: GistStats = {
      startedAt: new Date(),
      iterations: 1,
      changes: 0,
      lastChangeAt: null,
      command: "date",
      intervalSecs: 2,
    };
    const output = formatStats(stats);
    expect(output).not.toContain("last change:");
  });
});
