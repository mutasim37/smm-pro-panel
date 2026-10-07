import { test } from "node:test";
import { strict as assert } from "node:assert";
import { sendDocumentFile } from "./telegram.server";

test("Markdown delivery uploads the complete document to the purchasing chat", async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = "test-only-token";
  let uploads = 0;
  globalThis.fetch = async (_input, init) => {
    uploads++;
    assert.ok(init?.body instanceof FormData);
    assert.equal(init.body.get("chat_id"), "7547369708");
    const document = init.body.get("document");
    assert.ok(document instanceof File);
    assert.equal(document.name, "ZEXXA-USAGE-GUIDE.md");
    assert.equal(await document.text(), "# Guide\nRead before first use.\n— ZEXXA");
    return Response.json({ ok: true, result: { message_id: 100 } });
  };
  try {
    assert.deepEqual(await sendDocumentFile(7547369708, "ZEXXA-USAGE-GUIDE.md", "# Guide\nRead before first use.\n— ZEXXA", "Read the guide."), { message_id: 100 });
    assert.equal(uploads, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = originalToken;
  }
});