import { test } from "node:test";
import assert from "node:assert/strict";
import { applyDiscount, parseCouponSpec, productMatches } from "./coupon-rules";

test("percent coupon with product, uses and days", () => {
  const s = parseCouponSpec("10% product=1234 uses=20 days=7 code=eid24", 122)!;
  assert.equal(s.percent, 10);
  assert.equal(s.product, "1234");
  assert.equal(s.maxUses, 20);
  assert.equal(s.days, 7);
  assert.equal(s.code, "EID24");
});

test("taka coupon converts to USD", () => {
  assert.equal(parseCouponSpec("৳122", 122)!.amountUsd, 1);
});

test("invalid percent rejected", () => {
  assert.equal(parseCouponSpec("150%", 122), null);
});

test("discount never goes below one cent", () => {
  assert.equal(applyDiscount(1, { percent: null, amount_usd: 5 }), 0.01);
  assert.equal(applyDiscount(2, { percent: 10, amount_usd: null }), 1.8);
});

test("product restriction only matches its code", () => {
  assert.equal(productMatches("1234", ["999", "BD"]), false);
  assert.equal(productMatches("BD", ["999", "bd"]), true);
  assert.equal(productMatches(null, ["1"]), true);
});
