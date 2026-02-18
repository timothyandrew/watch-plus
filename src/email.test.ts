import { test, expect, describe, mock, beforeEach } from "bun:test";
import { createEmailSender } from "./email.ts";

// Mock the Resend module
const mockSend = mock(() => Promise.resolve({ id: "test-id" }));

mock.module("resend", () => ({
  Resend: class {
    emails = { send: mockSend };
  },
}));

describe("createEmailSender", () => {
  beforeEach(() => {
    mockSend.mockClear();
  });

  const baseParams = {
    to: "user@example.com",
    from: "sender@example.com",
    subject: "Change detected",
    oldOutput: "old content\n",
    newOutput: "new content\n",
    command: "test-cmd",
    cooldownMs: 0, // no cooldown for basic tests
  };

  test("sends email successfully", async () => {
    const sender = createEmailSender("test-api-key");
    const result = await sender.sendChangeNotification(baseParams);

    expect(result.sent).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);

    const call = mockSend.mock.calls[0]![0] as Record<string, unknown>;
    expect(call.to).toBe("user@example.com");
    expect(call.from).toBe("sender@example.com");
    expect(call.subject).toBe("Change detected");
    expect(typeof call.html).toBe("string");
    expect(typeof call.text).toBe("string");
  });

  test("email HTML contains diff formatting", async () => {
    const sender = createEmailSender("test-api-key");
    await sender.sendChangeNotification(baseParams);

    const call = mockSend.mock.calls[0]![0] as Record<string, unknown>;
    const html = call.html as string;
    expect(html).toContain("Change detected");
    expect(html).toContain("test-cmd");
    expect(html).toContain("watch+");
  });

  test("respects cooldown period and queues changes", async () => {
    const sender = createEmailSender("test-api-key");

    // First send — should go through
    const result1 = await sender.sendChangeNotification({
      ...baseParams,
      cooldownMs: 60_000,
    });
    expect(result1.sent).toBe(true);

    // Second send immediately — should be blocked by cooldown but queued
    const result2 = await sender.sendChangeNotification({
      ...baseParams,
      cooldownMs: 60_000,
    });
    expect(result2.sent).toBe(false);
    expect(result2.reason).toContain("queued");
  });

  test("allows sending after cooldown expires", async () => {
    const sender = createEmailSender("test-api-key");

    // Send with 0 cooldown
    const result1 = await sender.sendChangeNotification({
      ...baseParams,
      cooldownMs: 0,
    });
    expect(result1.sent).toBe(true);

    // Send again immediately with 0 cooldown — should work
    const result2 = await sender.sendChangeNotification({
      ...baseParams,
      cooldownMs: 0,
    });
    expect(result2.sent).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  test("flushPending sends queued change after cooldown", async () => {
    const sender = createEmailSender("test-api-key");

    // First send — goes through
    await sender.sendChangeNotification({
      ...baseParams,
      cooldownMs: 50,
    });
    expect(mockSend).toHaveBeenCalledTimes(1);

    // Second send during cooldown — queued
    const result2 = await sender.sendChangeNotification({
      ...baseParams,
      oldOutput: "old content\n",
      newOutput: "even newer content\n",
      cooldownMs: 50,
    });
    expect(result2.sent).toBe(false);
    expect(mockSend).toHaveBeenCalledTimes(1);

    // Flush before cooldown expires — still blocked
    const flush1 = await sender.flushPending();
    expect(flush1.sent).toBe(false);
    expect(flush1.reason).toBe("Cooldown still active");

    // Wait for cooldown to expire
    await Bun.sleep(60);

    // Flush after cooldown — should send
    const flush2 = await sender.flushPending();
    expect(flush2.sent).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  test("flushPending with no pending changes is a no-op", async () => {
    const sender = createEmailSender("test-api-key");

    const result = await sender.flushPending();
    expect(result.sent).toBe(false);
    expect(result.reason).toBe("No pending changes");
    expect(mockSend).toHaveBeenCalledTimes(0);
  });

  test("multiple queued changes collapse into one email", async () => {
    const sender = createEmailSender("test-api-key");

    // First send
    await sender.sendChangeNotification({
      ...baseParams,
      oldOutput: "version 1\n",
      newOutput: "version 2\n",
      cooldownMs: 50,
    });
    expect(mockSend).toHaveBeenCalledTimes(1);

    // Second change during cooldown — queued
    await sender.sendChangeNotification({
      ...baseParams,
      oldOutput: "version 2\n",
      newOutput: "version 3\n",
      cooldownMs: 50,
    });

    // Third change during cooldown — updates queue, keeps original oldOutput
    await sender.sendChangeNotification({
      ...baseParams,
      oldOutput: "version 3\n",
      newOutput: "version 4\n",
      cooldownMs: 50,
    });

    expect(mockSend).toHaveBeenCalledTimes(1);

    // Wait for cooldown
    await Bun.sleep(60);

    const flush = await sender.flushPending();
    expect(flush.sent).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(2);

    // The combined email should diff from version 2 (first queued old) to version 4 (latest new)
    const call = mockSend.mock.calls[1]![0] as Record<string, unknown>;
    const text = call.text as string;
    expect(text).toContain("-version 2");
    expect(text).toContain("+version 4");
    expect(text).not.toContain("version 3");
  });

  test("handles send failure gracefully", async () => {
    mockSend.mockImplementationOnce(() =>
      Promise.reject(new Error("API error")),
    );

    const sender = createEmailSender("test-api-key");
    const result = await sender.sendChangeNotification(baseParams);

    expect(result.sent).toBe(false);
    expect(result.reason).toBe("API error");
  });

  test("handles non-Error throw", async () => {
    mockSend.mockImplementationOnce(() => Promise.reject("string error"));

    const sender = createEmailSender("test-api-key");
    const result = await sender.sendChangeNotification(baseParams);

    expect(result.sent).toBe(false);
    expect(result.reason).toBe("string error");
  });
});
