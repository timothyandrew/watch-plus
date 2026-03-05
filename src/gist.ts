const GITHUB_API = "https://api.github.com";

export interface GistSender {
  initialize(content: string): Promise<string>;
  updateGist(content: string): Promise<void>;
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

export function deriveFilename(commandStr: string): string {
  const sanitized = commandStr
    .replace(/[^a-zA-Z0-9_\- ]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return (sanitized || "output") + ".txt";
}

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
  let filename: string = deriveFilename(commandStr);
  let gistUrl: string | null = null;

  return {
    get gistUrl() {
      return gistUrl;
    },

    async initialize(content: string): Promise<string> {
      try {
        if (existingGistId) {
          // Validate existing gist and discover its filename
          const res = await fetch(`${GITHUB_API}/gists/${existingGistId}`, {
            headers,
          });
          if (!res.ok) {
            throw new Error(`Failed to fetch gist ${existingGistId}: ${res.status} ${res.statusText}`);
          }
          const data = (await res.json()) as { html_url: string; files: Record<string, unknown> };
          gistUrl = data.html_url;
          // Use the first existing filename
          const existingFilename = Object.keys(data.files)[0];
          if (existingFilename) {
            filename = existingFilename;
          }
          // Update with initial content
          await this.updateGist(content);
          return gistUrl;
        }

        // Create new gist
        const res = await fetch(`${GITHUB_API}/gists`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            public: false,
            description: `watch+: ${commandStr}`,
            files: { [filename]: { content } },
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

    async updateGist(content: string): Promise<void> {
      if (!gistId) return;
      try {
        const res = await fetch(`${GITHUB_API}/gists/${gistId}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            files: { [filename]: { content } },
          }),
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
