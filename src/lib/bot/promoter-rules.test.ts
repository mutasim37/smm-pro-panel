import { expect, test } from "bun:test";
const describe = (_: string, fn: () => void) => fn();
import { defaultPromoPct, promoFee } from "./promoter-rules";

describe("promoter rules", () => {
  test("SMM pays 10%", () => expect(defaultPromoPct("smm")).toBe(10));
  test("SMS pays 20%", () => expect(defaultPromoPct("sms")).toBe(20));
  test("bKash fee is 2%", () => expect(promoFee("bkash", 10)).toBe(0.2));
  test("Binance is free", () => expect(promoFee("binance", 10)).toBe(0));
  test("USDT fee is $0.10", () => expect(promoFee("usdt", 10)).toBe(0.1));
});
