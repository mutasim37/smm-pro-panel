## Frrr SMS rules

- Frrr SMS enters webhook3 under runAsBot("sms"), uses bot3_* wallets/state/history and its own settings/channel; shared payment claims remain global to prevent reuse.
- SMS reservations and refunds are transactional service-role RPCs; ambiguous purchases go to review, cancellation refunds require ACCESS_CANCEL and no stored OTP, and polling takes a per-order lock to prevent concurrent cancellation/code races.
- SMS catalog caches persist in bot3_service_cache; a fresh capped supplier price is required before purchase, never expose supplier rates to customers.
- SMS OTP polling uses one dynamically armed minute job targeting production; stop after active orders and bounded notifications drain so idle bots do not poll.
- Frrr SMS supplier is 5SIM behind the `grizzly.server.ts` adapter, which translates 5SIM REST into handler-style status strings; keeps the audited reservation/refund logic unchanged.
- Frrr SMS has two servers: Server 1 = Grizzly (`grizzlysms.server.ts`, provider_id stored as `g:<id>`, `sms_g_multiplier`) and Server 2 = 5SIM (`sms_multiplier`); server is carried in callback suffix and checkout state so polling/refunds hit the right supplier.
- SMS prices = supplier cost × admin `sms_multiplier` (default 3); the Telegram Mini App at `/sms` verifies `initData` with the SMS bot token before showing prices or sending a quote.
- Free SMS numbers are scraped from receivesms.co in `free-otp.server.ts`; every listed number of every country is auto-watched 24/7 (rotating country refresh, half the numbers scanned per minute) and the full SMS text (plus detected code) is posted to @freesmsotp, never in the bot; refreshed watches keep the SMS minute job armed.
