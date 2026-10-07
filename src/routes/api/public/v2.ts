import { createFileRoute } from "@tanstack/react-router";

async function readParams(request: Request): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  new URL(request.url).searchParams.forEach((v, k) => (out[k] = v));
  if (request.method === "POST") {
    const type = request.headers.get("content-type") ?? "";
    if (type.includes("application/json")) {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      for (const [k, v] of Object.entries(body ?? {})) if (v != null) out[k] = Array.isArray(v) ? v.join(",") : String(v);
    } else {
      const text = await request.text();
      new URLSearchParams(text).forEach((v, k) => (out[k] = v));
    }
  }
  const header = request.headers.get("x-api-key");
  if (header && !out["key"]) out["key"] = header;
  return out;
}

async function handle(request: Request) {
  try {
    const { handleApi } = await import("@/lib/bot/api.server");
    const result = await handleApi(await readParams(request));
    return Response.json(result);
  } catch {
    return Response.json({ error: "Temporary error, please retry" });
  }
}

export const Route = createFileRoute("/api/public/v2")({
  server: { handlers: { POST: ({ request }) => handle(request), GET: ({ request }) => handle(request) } },
});
