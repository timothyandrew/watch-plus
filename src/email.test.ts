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

  test("respects cooldown period", async () => {
    const sender = createEmailSender("test-api-key");

    // First send — should go through
    const result1 = await sender.sendChangeNotification({
      ...baseParams,
      cooldownMs: 60_000,
    });
    expect(result1.sent).toBe(true);

    // Second send immediately — should be blocked by cooldown
    const result2 = await sender.sendChangeNotification({
      ...baseParams,
      cooldownMs: 60_000,
    });
    expect(result2.sent).toBe(false);
    expect(result2.reason).toContain("Cooldown");
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
