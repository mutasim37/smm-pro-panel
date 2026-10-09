import { test } from "node:test";
import { strict as assert } from "node:assert";
import { runAsBot } from "./scope.server";
import { minDepositUsd } from "./config.server";

test("SMM bot minimum deposit is $0.20", () => {
  assert.equal(runAsBot("smm", () => minDepositUsd()), 0.2);
});

test("TG bot minimum deposit is $0.50", () => {
  assert.equal(runAsBot("tg", () => minDepositUsd()), 0.5);
});

test("SMS bot minimum deposit is $1.00", () => {
  assert.equal(runAsBot("sms", () => minDepositUsd()), 1);
});

test("defaults to SMM minimum outside a bot scope", () => {
  assert.equal(minDepositUsd(), 0.2);
});
