import { z } from "zod";

const adjustmentSchema = z.object({
  userId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  enteredAmount: z.number().finite().refine(value => value !== 0),
  rate: z.number().finite().positive(),
});

export function parseBalanceAdjustment(text: string, rate: number) {
  const match = /^(\d{3,15})\s+(-?\d+(?:\.\d+)?)$/.exec(text.replace(/[$৳₹,]/g, "").trim());
  if (!match) return null;
  const parsed = adjustmentSchema.safeParse({userId: Number(match[1]), enteredAmount: Number(match[2]), rate});
  if (!parsed.success) return null;
  const amountUsd = Math.round(parsed.data.enteredAmount / parsed.data.rate * 100000) / 100000;
  if (!Number.isFinite(amountUsd) || amountUsd === 0) return null;
  return {...parsed.data, amountUsd};
}