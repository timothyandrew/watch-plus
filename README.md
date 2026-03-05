<p align="center">
  <img src=".github/logo.svg" alt="watch+" width="140" />
</p>

<p align="center">
  <strong>GNU <code>watch</code>, supercharged with notifications.</strong><br/>
  Know the instant your command output changes — in the terminal, your inbox, or a live GitHub Gist.
</p>

<p align="center">
  <a href="#quickstart">Quickstart</a> · <a href="#examples">Examples</a> · <a href="#flags">Flags</a> · <a href="#configuration">Configuration</a>
</p>

---

## Why watch+?

You're already running `watch` to keep an eye on things. But you can't stare at a terminal forever.

**watch+** is a drop-in replacement for GNU `watch` that adds email alerts via [Resend](https://resend.com) and live output to [GitHub Gists](https://gist.github.com). Same flags, same behavior — plus `--email` and `--gist` flags that change everything.

```mermaid
flowchart TD
    Command["🐚 Your Shell Command"] -->|runs every N seconds| WatchPlus["⚡ watch+"]
    WatchPlus --> Terminal["🖥️ Terminal<br/>fullscreen with diff highlight"]
    WatchPlus -->|output changed?| Email["📧 Resend<br/>email alert"]
    WatchPlus -->|every update| Gist["📝 GitHub Gist<br/>live output"]

    style Command fill:#1e293b,stroke:#475569,color:#e2e8f0
    style WatchPlus fill:#2d1f4e,stroke:#7c3aed,color:#e2e8f0
    style Terminal fill:#164e63,stroke:#06b6d4,color:#e2e8f0
    style Email fill:#4c1d95,stroke:#a78bfa,color:#e2e8f0
    style Gist fill:#1a3a2a,stroke:#34d399,color:#e2e8f0
```

## Quickstart

```bash
# Install dependencies
bun install

# Build a standalone binary
bun run build         # → ./watch+

# Or run directly
bun run src/index.ts -n 1 date
```

> **Cross-compile for Linux:** `bun build --compile --target=bun-linux-x64 src/index.ts --outfile watch+-linux-amd64`

## Examples

```bash
# 🕐 Live-updating clock
watch+ -n 1 date

# 🔍 Highlight changes to a file
watch+ -d -n 1 "cat /tmp/test.txt"

# 🚪 Exit as soon as output changes
watch+ -g -n 1 "date +%S"

# 📧 Email yourself when an API response changes
watch+ --email me@example.com \
       --from noreply@mydomain.com \
       --cooldown 30s \
       -n 2 \
       "curl -s https://api.example.com/status"

# 📝 Publish live output to a GitHub Gist
watch+ --gist -n 5 "kubectl get pods"

# 📝 Update an existing Gist
watch+ --gist-id abc123def456 -n 5 "kubectl get pods"

# 📊 Count errors in a log file
watch+ -n 5 -- grep -c ERROR /var/log/app.log
```

## Flags

### GNU watch compatible

All the flags you know. Fully compatible — swap `watch` for `watch+` in your scripts.

| Flag | Description |
|------|-------------|
| `-n, --interval <secs>` | Seconds between updates (default: `2`) |
| `-d, --differences [permanent]` | Highlight changes between updates |
| `-e, --errexit` | Exit on non-zero return code |
| `-g, --chgexit` | Exit when output changes |
| `-c, --color` | Pass through ANSI color sequences |
| `-C, --no-color` | Strip ANSI color sequences |
| `-t, --no-title` | Suppress header |
| `-w, --no-wrap` | Truncate long lines |
| `-x, --exec` | Pass command to exec instead of `sh -c` |
| `-p, --precise` | Attempt precise timing |
| `-b, --beep` | Beep on change |

### Email notifications

| Flag | Description |
|------|-------------|
| `--email <address>` | Email address to notify on change |
| `--from <address>` | Sender email address (required with `--email`) |
| `--cooldown <duration>` | Min time between emails — e.g. `30s`, `5m`, `1h` (default: `1m`) |
| `--subject <text>` | Custom email subject |
| `--api-key <key>` | Resend API key |

Changes that occur during the cooldown period are queued and sent as a single email once the cooldown expires — no changes are dropped.

### GitHub Gist output

| Flag | Description |
|------|-------------|
| `--gist` | Create a new private Gist and push output to it on every update |
| `--gist-id <id>` | Push output to an existing Gist |

Requires the [GitHub CLI](https://cli.github.com/) (`gh auth login`). Output is written to `output.md` in the Gist, alongside a `statistics.txt` file with uptime, iteration count, and change count.

### Keyboard

| Key | Action |
|-----|--------|
| <kbd>Space</kbd> | Force an immediate re-run |
| <kbd>q</kbd> | Quit |
| <kbd>Ctrl+C</kbd> | Quit |

## Architecture

```mermaid
graph LR
    CLI["CLI<br/><small>commander</small>"] --> Config["Config<br/><small>~/.watch+/config.json</small>"]
    Config --> Watch["Watch Loop<br/><small>execute → compare → render</small>"]
    Watch --> Terminal["Terminal<br/><small>fullscreen + diff highlight</small>"]
    Watch -->|output changed?| Email["Email<br/><small>Resend API + cooldown</small>"]
    Watch -->|every update| Gist["Gist<br/><small>GitHub API</small>"]

    style CLI fill:#1e293b,stroke:#475569,color:#e2e8f0
    style Config fill:#1e293b,stroke:#475569,color:#e2e8f0
    style Watch fill:#2d1f4e,stroke:#7c3aed,color:#e2e8f0
    style Terminal fill:#164e63,stroke:#06b6d4,color:#e2e8f0
    style Email fill:#4c1d95,stroke:#a78bfa,color:#e2e8f0
    style Gist fill:#1a3a2a,stroke:#34d399,color:#e2e8f0
```

| Module | Responsibility |
|--------|---------------|
| **index.ts** | CLI parsing with Commander, flag validation |
| **config.ts** | Loads `~/.watch+/config.json`, merges CLI + env + config with correct priority |
| **watch.ts** | Core loop — executes command, diffs output, renders fullscreen terminal UI |
| **diff.ts** | Change detection, unified diff generation, HTML formatting for emails |
| **email.ts** | Sends notifications via Resend with cooldown throttling and queuing |
| **gist.ts** | Creates/updates GitHub Gists via the GitHub API with statistics tracking |

## Configuration

Create `~/.watch+/config.json` to set defaults so you don't have to pass flags every time:

```json
{
  "resendApiKey": "re_...",
  "defaultTo": "alerts@example.com",
  "defaultFrom": "watch+@mydomain.com",
  "defaultCooldown": "5m",
  "defaultInterval": 2
}
```

The Resend API key can also be set via the `RESEND_API_KEY` environment variable.

> **Priority:** CLI flags > environment variables > config file > defaults

---

<p align="center">
  Built with <a href="https://bun.sh">Bun</a> + TypeScript
</p>
