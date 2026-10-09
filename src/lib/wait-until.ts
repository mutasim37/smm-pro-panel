// Exposes the Worker execution context so long jobs can finish after the HTTP reply. Server-only.
import { AsyncLocalStorage } from "node:async_hooks";
type ExecCtx = { waitUntil?: (p: Promise<unknown>) => void };
const store = new AsyncLocalStorage<ExecCtx>();
export function runWithExecCtx<T>(ctx: unknown, fn: () => T): T {
  return store.run((ctx ?? {}) as ExecCtx, fn);
}
/** Runs the job in the background when the runtime supports it; otherwise awaits it. */
export async function background(job: Promise<unknown>): Promise<void> {
  const ctx = store.getStore();
  if (ctx?.waitUntil) { ctx.waitUntil(job.catch(() => null)); return; }
  await job.catch(() => null);
}
