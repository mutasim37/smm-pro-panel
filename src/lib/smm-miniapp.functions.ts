import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
const init = z.string().min(1).max(4096);
export const loadSmmPlatforms = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ initData: init }).parse(d))
  .handler(async ({ data }) => { const m = await import("./bot/smm-miniapp.server"); return m.smmPlatforms(data.initData); });
export const loadSmmCategory = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ initData: init, index: z.number().int().min(0).max(100000) }).parse(d))
  .handler(async ({ data }) => { const m = await import("./bot/smm-miniapp.server"); return m.smmCategory(data.initData, data.index); });
export const selectSmmService = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ initData: init, serviceId: z.number().int().positive() }).parse(d))
  .handler(async ({ data }) => { const m = await import("./bot/smm-miniapp.server"); return m.smmSelect(data.initData, data.serviceId); });
