import { test, expect, mock } from "bun:test";
mock.module("./store.server", () => ({ supabaseAdmin: {} }));
const { parseBkashSms, generateBkashRef, normalizeBdPhone } = await import("./bkash.server");

test("bKash SMS yields payer number and reference", () => {
  const p = parseBkashSms("You have received Tk 1,005.00 from 01756650526. Ref amanah. Fee Tk 0.00. Balance Tk 1,007.29. TrxID DJA2P4JGTE at 10/10/2026 14:32");
  expect(p).toEqual({ trxId: "DJA2P4JGTE", amount: 1005, from: "01756650526", ref: "AMANAH" });
});

test("Super Mode reference is 8 characters", () => {
  expect(generateBkashRef()).toMatch(/^[A-Z2-9]{8}$/);
});

test("payer number must be a Bangladeshi mobile", () => {
  expect(normalizeBdPhone("+8801756650526")).toBe("01756650526");
  expect(normalizeBdPhone("12345")).toBeNull();
});
