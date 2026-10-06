import { test } from "node:test";
import { strict as assert } from "node:assert";
import { adminChatIds, setBotAccess, supportUsername } from "./config.server";

test("Frrr Ohi receives admin access without removing the owner", () => {
  setBotAccess([8872393234, 7547369708], "Frreohi");
  assert.equal(adminChatIds().includes(7547369708), true);
  assert.equal(adminChatIds().includes(8872393234), true);
});
test("customer support is Frreohi rather than the previous contact", () => {
  setBotAccess([8872393234, 7547369708], "Frreohi");
  assert.equal(supportUsername(), "Frreohi");
});