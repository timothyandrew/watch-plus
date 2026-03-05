const GITHUB_API = "https://api.github.com";

export interface GistStats {
  startedAt: Date;
  iterations: number;
  changes: number;
  lastChangeAt: Date | null;
  command: string;
  intervalSecs: number;
}

export interface GistSender {
  initialize(content: string): Promise<string>;
  updateGist(content: string, stats?: GistStats): Promise<void>;
  gistUrl: string | null;
}

export async function getGitHubToken(): Promise<string> {
  try {
    const result = Bun.spawnSync(["gh", "auth", "token"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const token = result.stdout.toString().trim();
    if (result.exitCode !== 0 || !token) {
      throw new Error();
    }
    return token;
  } catch {
    throw new Error(
      "watch+: could not get GitHub token.\n" +
        "Install the GitHub CLI and run: gh auth login",
    );
  }
}

export function formatUptime(ms: number): string {
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);

  if (days > 0) return `${days}d ${hrs % 24}h ${mins % 60}m`;
  if (hrs > 0) return `${hrs}h ${mins % 60}m ${secs % 60}s`;
  if (mins > 0) return `${mins}m ${secs % 60}s`;
  return `${secs}s`;
}

export function formatStats(stats: GistStats): string {
  const uptime = formatUptime(Date.now() - stats.startedAt.getTime());
  const lines = [
    `command:      ${stats.command}`,
    `interval:     ${stats.intervalSecs}s`,
    `started:      ${stats.startedAt.toISOString()}`,
    `uptime:       ${uptime}`,
    `iterations:   ${stats.iterations}`,
    `changes:      ${stats.changes}`,
  ];
  if (stats.lastChangeAt) {
    lines.push(`last change:  ${stats.lastChangeAt.toISOString()}`);
  }
  return lines.join("\n") + "\n";
}

const STATS_FILENAME = "statistics.txt";

export function createGistSender(
  token: string,
  commandStr: string,
  existingGistId?: string,
): GistSender {
  const headers = {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "watch-plus",
  };

  let gistId: string | null = existingGistId ?? null;
  let filename: string = "output.md";
  let gistUrl: string | null = null;

  return {
    get gistUrl() {
      return gistUrl;
    },

    async initialize(content: string): Promise<string> {
      try {
        if (existingGistId) {
          // Validate existing gist
          const res = await fetch(`${GITHUB_API}/gists/${existingGistId}`, {
            headers,
          });
          if (!res.ok) {
            throw new Error(`Failed to fetch gist ${existingGistId}: ${res.status} ${res.statusText}`);
          }
          const data = (await res.json()) as { html_url: string };
          gistUrl = data.html_url;
          return gistUrl;
        }

        // Create new gist
        const res = await fetch(`${GITHUB_API}/gists`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            public: false,
            description: `watch+: ${commandStr}`,
            files: {
              [filename]: { content },
              [STATS_FILENAME]: { content: "watch+: initializing...\n" },
            },
          }),
        });
        if (!res.ok) {
          throw new Error(`Failed to create gist: ${res.status} ${res.statusText}`);
        }
        const data = (await res.json()) as { id: string; html_url: string };
        gistId = data.id;
        gistUrl = data.html_url;
        return gistUrl;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`watch+: gist error: ${msg}\n`);
        throw err;
      }
    },

    async updateGist(content: string, stats?: GistStats): Promise<void> {
      if (!gistId) return;
      try {
        const files: Record<string, { content: string }> = {
          [filename]: { content },
        };
        if (stats) {
          files[STATS_FILENAME] = { content: formatStats(stats) };
        }
        const res = await fetch(`${GITHUB_API}/gists/${gistId}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ files }),
        });
        if (!res.ok) {
          process.stderr.write(
            `watch+: gist update failed: ${res.status} ${res.statusText}\n`,
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`watch+: gist error: ${msg}\n`);
      }
    },
  };
}
