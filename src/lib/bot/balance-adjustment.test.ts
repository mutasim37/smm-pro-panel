import { test } from "node:test";
import { strict as assert } from "node:assert";
import { parseBalanceAdjustment } from "./balance-adjustment";

test("BDT entry converts taka to stored USD", () => assert.equal(parseBalanceAdjustment("8872393234 122",122)?.amountUsd,1));
test("INR entry converts rupees to stored USD", () => assert.equal(parseBalanceAdjustment("8872393234 88",88)?.amountUsd,1));
test("USD entry retains dollar value", () => assert.equal(parseBalanceAdjustment("8872393234 10",1)?.amountUsd,10));
test("selected currency also applies to deductions", () => assert.equal(parseBalanceAdjustment("8872393234 -244",122)?.amountUsd,-2));
test("malformed and zero adjustments are rejected", () => {assert.equal(parseBalanceAdjustment("8872393234 0",122),null);assert.equal(parseBalanceAdjustment("8872393234 Infinity",1),null);assert.equal(parseBalanceAdjustment("8872393234 10",0),null);});