import { test, expect, describe, mock, beforeEach, afterEach } from "bun:test";
import { deriveFilename, getGitHubToken, createGistSender } from "./gist.ts";

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

  test("initialize creates a new gist and returns URL", async () => {
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

  test("updateGist PATCHes the gist", async () => {
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
    await sender.updateGist("updated content");

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [patchUrl, patchOpts] = mockFetch.mock.calls[1]! as [string, RequestInit];
    expect(patchUrl).toBe("https://api.github.com/gists/abc123");
    expect(patchOpts.method).toBe("PATCH");
    const body = JSON.parse(patchOpts.body as string);
    expect(body.files["echo-hello.txt"].content).toBe("updated content");
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
