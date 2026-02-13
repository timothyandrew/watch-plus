# watch+

Like GNU `watch`, but emails you when command output changes.

Built with Bun + TypeScript. Uses [Resend](https://resend.com) for email delivery.

## Install

### macOS (Apple Silicon)

```bash
bun install
bun run build
# produces a standalone ./watch+ binary
```

### Linux (amd64)

```bash
bun install
bun build --compile --target=bun-linux-x64 src/index.ts --outfile watch+-linux-amd64
```

### Development

```bash
bun run src/index.ts -n 1 date
```

## Usage

```
watch+ [options] <command...>
```

### GNU watch flags

| Flag | Description |
|------|-------------|
| `-n, --interval <secs>` | Seconds between updates (default: 2) |
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

### Email flags

| Flag | Description |
|------|-------------|
| `--email <address>` | Email address to notify on change |
| `--from <address>` | Sender email address (required with `--email`) |
| `--cooldown <duration>` | Min time between emails (default: `1m`) |
| `--subject <text>` | Custom email subject |
| `--api-key <key>` | Resend API key |

### Keyboard shortcuts

- `q` — quit
- `Space` — immediate re-run
- `Ctrl+C` — quit

## Examples

```bash
# Live-updating clock
watch+ -n 1 date

# Highlight changes to a file
watch+ -d -n 1 "cat /tmp/test.txt"

# Exit when output changes
watch+ -g -n 1 "date +%S"

# Email on change with 30s cooldown
watch+ --email me@example.com --from noreply@mydomain.com --cooldown 30s -n 2 "curl -s https://api.example.com/status"

# Commands with flags (use --)
watch+ -n 5 -- grep -c ERROR /var/log/app.log
```

## Configuration

Create `~/.watch+/config.json` to set defaults. See `config.example.json` for the format.

The Resend API key can also be set via the `RESEND_API_KEY` environment variable.

Priority: CLI flags > env vars > config file > defaults.
