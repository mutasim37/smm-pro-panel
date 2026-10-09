import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
export const loadSmsMiniCatalog = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ initData: z.string().min(1).max(4096) }).parse(d))
  .handler(async ({ data }) => { const { miniCatalog } = await import("./bot/miniapp.server"); return miniCatalog(data.initData); });
export const selectSmsMini = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ initData: z.string().min(1).max(4096), service: z.string().min(1).max(64), country: z.string().min(1).max(64) }).parse(d))
  .handler(async ({ data }) => { const { miniSelect } = await import("./bot/miniapp.server"); return miniSelect(data.initData, data.service, data.country); });
