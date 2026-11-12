/**
 * Vercel Config vs Secret classification for this project.
 * - Config: readable after save (public prefixes, non-sensitive switches)
 * - Secret: write-only after save (API keys, tokens) — never NEXT_PUBLIC_
 *
 * Changes on Vercel apply only to NEW deployments.
 */

export type EnvKind = "config" | "secret";
export type EnvTarget = "production" | "preview" | "development";

export type EnvVarSpec = {
  key: string;
  kind: EnvKind;
  targets: EnvTarget[];
  required: boolean;
  description: string;
  /** If true, value is safe for client bundles (must be Config). */
  clientExposed?: boolean;
};

/** Project environment variable inventory. */
export const ENV_CATALOG: EnvVarSpec[] = [
  {
    key: "XAI_API_KEY",
    kind: "secret",
    targets: ["production", "preview", "development"],
    required: true,
    description: "xAI API key for server-side Grok chat. Never expose to the browser.",
  },
  {
    key: "XAI_MODEL",
    kind: "config",
    targets: ["production", "preview", "development"],
    required: false,
    description: "Grok model id for chat route (default grok-3-latest).",
  },
  {
    key: "XAI_BASE_URL",
    kind: "config",
    targets: ["production", "preview", "development"],
    required: false,
    description: "xAI API base URL (default https://api.x.ai/v1).",
  },
  {
    key: "GROK_CHAT_ENABLED",
    kind: "config",
    targets: ["production", "preview", "development"],
    required: false,
    description: "Set to 'true' to enable the server chat endpoint.",
  },
  {
    key: "VITE_AUTH_ENABLED",
    kind: "config",
    targets: ["production", "preview", "development"],
    required: false,
    clientExposed: true,
    description: "Client auth gate switch for App Builder preview.",
  },
  {
    key: "GROK_PROJECT_ID",
    kind: "config",
    targets: ["production", "preview"],
    required: false,
    description: "Set by Grok App Builder on publish. Distinguishes preview vs deployed.",
  },
  {
    key: "VERCEL_TOKEN",
    kind: "secret",
    targets: ["development"],
    required: false,
    description: "Optional local/CLI token. Prefer connector or dashboard; never commit.",
  },
];

export function envCatalogText(): string {
  const lines = [
    "Environment variable catalog (Config vs Secret)",
    "------------------------------------------------",
  ];
  for (const item of ENV_CATALOG) {
    lines.push(
      `${item.key} | ${item.kind.toUpperCase()} | targets=${item.targets.join(",")} | required=${item.required}`,
    );
    lines.push(`  ${item.description}`);
  }
  lines.push("");
  lines.push("Rules:");
  lines.push("- Secrets never use VITE_ or NEXT_PUBLIC_ prefixes.");
  lines.push("- After changing Vercel env vars, redeploy for values to take effect.");
  lines.push("- Total env size ≤ 64KB per deployment; edge vars ≤ 5KB each.");
  return lines.join("\n");
}
