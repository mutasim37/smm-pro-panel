import { test } from "node:test";
import { strict as assert } from "node:assert";
import { apiAddress, apiDocsAddress, apiAccessAllowed, validRequestId } from "./api-rules";
test("three bots have distinct API addresses", () => assert.equal(new Set(["smm","tg","sms"].map(b => apiAddress(b as "smm"|"tg"|"sms"))).size,3));
test("three bots have distinct documentation addresses", () => assert.equal(new Set(["smm","tg","sms"].map(b => apiDocsAddress(b as "smm"|"tg"|"sms"))).size,3));
test("empty wallet cannot use reseller purchase actions", () => assert.equal(apiAccessAllowed(0,false),false));
test("banned customer cannot use reseller purchase actions", () => assert.equal(apiAccessAllowed(10,true),false));
test("one cent wallet is eligible but purchase still checks total", () => assert.equal(apiAccessAllowed(.01,false),true));
test("idempotent purchases require UUID request ID", () => {assert.equal(validRequestId("not-a-uuid"),false);assert.equal(validRequestId("3bdaeddb-ac0d-42c9-851d-cf8e9a9ee2dd"),true);});