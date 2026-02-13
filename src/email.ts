import { Resend } from "resend";
import { generateDiff, diffToHtml } from "./diff.ts";

interface EmailSender {
  sendChangeNotification(params: {
    to: string;
    from: string;
    subject: string;
    oldOutput: string;
    newOutput: string;
    command: string;
    cooldownMs: number;
  }): Promise<{ sent: boolean; reason?: string }>;
}

export function createEmailSender(apiKey: string): EmailSender {
  const resend = new Resend(apiKey);
  let lastEmailSentAt = 0;

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
        const remaining = Math.ceil((cooldownMs - elapsed) / 1000);
        return {
          sent: false,
          reason: `Cooldown active (${remaining}s remaining)`,
        };
      }

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
    },
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
