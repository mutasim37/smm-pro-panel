import { describe, expect, test } from "bun:test";
import { runAsBot } from "./scope.server";
import { minDepositUsd } from "./config.server";

describe("per-bot minimum deposit", () => {
  test("SMM bot minimum is $0.20", () => {
    expect(runAsBot("smm", () => minDepositUsd())).toBe(0.2);
  });

  test("TG bot minimum is $0.50", () => {
    expect(runAsBot("tg", () => minDepositUsd())).toBe(0.5);
  });

  test("SMS bot minimum is $1.00", () => {
    expect(runAsBot("sms", () => minDepositUsd())).toBe(1);
  });

  test("defaults to SMM minimum outside a bot scope", () => {
    expect(minDepositUsd()).toBe(0.2);
  });
});
