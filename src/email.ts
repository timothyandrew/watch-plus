import { Resend } from "resend";
import { generateDiff, diffToHtml } from "./diff.ts";

export interface EmailSender {
  sendChangeNotification(params: {
    to: string;
    from: string;
    subject: string;
    oldOutput: string;
    newOutput: string;
    command: string;
    cooldownMs: number;
  }): Promise<{ sent: boolean; reason?: string }>;
  flushPending(): Promise<{ sent: boolean; reason?: string }>;
}

interface QueuedChange {
  to: string;
  from: string;
  subject: string;
  oldOutput: string;
  newOutput: string;
  command: string;
  cooldownMs: number;
}

export function createEmailSender(apiKey: string): EmailSender {
  const resend = new Resend(apiKey);
  let lastEmailSentAt = 0;
  let pending: QueuedChange | null = null;

  async function sendEmail(
    to: string,
    from: string,
    subject: string,
    oldOutput: string,
    newOutput: string,
    command: string,
  ): Promise<{ sent: boolean; reason?: string }> {
    try {
      const diffText = generateDiff(oldOutput, newOutput, command);
      const diffHtml = diffToHtml(diffText);

      const html = `
<h2 style="font-family:sans-serif;margin:0 0 16px">Change detected</h2>
<p style="font-family:sans-serif;color:#586069;margin:0 0 16px">Command: <code>${escapeHtml(command)}</code></p>
${diffHtml}
<p style="font-family:sans-serif;color:#586069;font-size:12px;margin:16px 0 0">Sent by watch+</p>`.trim();

      await resend.emails.send({
        from,
        to,
        subject,
        html,
        text: diffText,
      });

      lastEmailSentAt = Date.now();
      return { sent: true };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err);
      process.stderr.write(`watch+: email error: ${message}\n`);
      return { sent: false, reason: message };
    }
  }

  return {
    async sendChangeNotification({
      to,
      from,
      subject,
      oldOutput,
      newOutput,
      command,
      cooldownMs,
    }) {
      const now = Date.now();
      const elapsed = now - lastEmailSentAt;

      if (elapsed < cooldownMs) {
        // Queue this change — keep the earliest oldOutput and latest newOutput
        if (pending) {
          pending.newOutput = newOutput;
        } else {
          pending = { to, from, subject, oldOutput, newOutput, command, cooldownMs };
        }
        const remaining = Math.ceil((cooldownMs - elapsed) / 1000);
        return {
          sent: false,
          reason: `Cooldown active (${remaining}s remaining), change queued`,
        };
      }

      pending = null;
      return sendEmail(to, from, subject, oldOutput, newOutput, command);
    },

    async flushPending() {
      if (!pending) {
        return { sent: false, reason: "No pending changes" };
      }

      const now = Date.now();
      const elapsed = now - lastEmailSentAt;

      if (elapsed < pending.cooldownMs) {
        return { sent: false, reason: "Cooldown still active" };
      }

      const queued = pending;
      pending = null;
      return sendEmail(
        queued.to,
        queued.from,
        queued.subject,
        queued.oldOutput,
        queued.newOutput,
        queued.command,
      );
    },
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
