import { createServerFn } from "@tanstack/react-start";
import { env } from "@/lib/env.server";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type ChatInput = {
  messages: ChatMessage[];
};

function assertServerSafeMessages(messages: ChatMessage[]) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("messages must be a non-empty array.");
  }
  if (messages.length > 40) {
    throw new Error("Too many messages (max 40).");
  }
  for (const m of messages) {
    if (!m || typeof m.content !== "string" || !m.content.trim()) {
      throw new Error("Each message needs non-empty content.");
    }
    if (!["system", "user", "assistant"].includes(m.role)) {
      throw new Error("Invalid message role.");
    }
    if (m.content.length > 12000) {
      throw new Error("Message content too long.");
    }
  }
}

/**
 * Server-only Grok chat. Reads XAI_API_KEY from the environment (Vercel Secret
 * or sandbox process env). Never import this module from client components
 * except via the createServerFn RPC surface.
 */
export const chatWithGrok = createServerFn({ method: "POST" })
  .inputValidator((data: ChatInput) => data)
  .handler(async ({ data }) => {
    assertServerSafeMessages(data.messages);

    const enabled = (env("GROK_CHAT_ENABLED") ?? "true").toLowerCase() !== "false";
    if (!enabled) {
      return {
        ok: false as const,
        error: "Grok chat is disabled (GROK_CHAT_ENABLED=false).",
      };
    }

    const apiKey = env("XAI_API_KEY");
    if (!apiKey) {
      return {
        ok: false as const,
        error:
          "XAI_API_KEY is not set. Add it as a Vercel Secret for Production/Preview/Development, then redeploy.",
      };
    }

    const base = (env("XAI_BASE_URL") ?? "https://api.x.ai/v1").replace(/\/$/, "");
    const model = env("XAI_MODEL") ?? "grok-3-latest";

    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: data.messages,
        temperature: 0.6,
        stream: false,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      // Do not echo secrets. Truncate provider error.
      return {
        ok: false as const,
        error: `xAI request failed (${response.status}). ${body.slice(0, 200)}`,
      };
    }

    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      model?: string;
    };
    const content = json.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) {
      return { ok: false as const, error: "Empty model response." };
    }

    return {
      ok: true as const,
      content,
      model: json.model ?? model,
    };
  });

/** Readiness check — never returns the secret value. */
export const getGrokEnvStatus = createServerFn({ method: "POST" }).handler(async () => {
  const hasKey = Boolean(env("XAI_API_KEY"));
  return {
    hasXaiApiKey: hasKey,
    model: env("XAI_MODEL") ?? "grok-3-latest",
    chatEnabled: (env("GROK_CHAT_ENABLED") ?? "true").toLowerCase() !== "false",
    baseUrlConfigured: Boolean(env("XAI_BASE_URL")),
    note: hasKey
      ? "XAI_API_KEY present on server. Client never sees the value."
      : "XAI_API_KEY missing. Set as Secret on Vercel and redeploy.",
  };
});
