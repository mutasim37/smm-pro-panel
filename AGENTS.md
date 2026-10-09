<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules

- Bundle the supplied extension guide as raw Markdown and upload it through Telegram multipart documents after purchase; no public file URL or runtime filesystem is needed.

- The Telegram bot lives in `src/lib/bot/*.server.ts` and is driven by one public
  webhook route (`src/routes/api/public/telegram/webhook.ts`) — keeps all bot
  logic server-only and off the client bundle.
- The webhook is authenticated with `base64url(sha256("telegram-webhook:" + token))` where the Frrr SMM token is `bot_secrets.bot1_token` (falls back to env TELEGRAM_BOT_TOKEN)
  sent in `X-Telegram-Bot-Api-Secret-Token`; no other auth layer guards it.
- Provider prices (SMMGen markup %, TG-account multiplier) come from the admin-editable `bot_settings` table via `settings.server.ts` — never show raw provider rates.
- The service catalog is cached in memory (15 min) with a `bot_service_cache`
  DB fallback (6 h) so updates stay fast without hammering the provider.
- USDT (BEP20) deposits are verified through public BSC JSON-RPC nodes in
  `bsc.server.ts` — no third-party explorer API key is required.
- `bot_deposits.tx_hash` is UNIQUE: that constraint is the only thing preventing
  a transaction hash from being credited twice.
- All money is stored in USD; `money()` renders it in the user's chosen currency (BDT/INR/USD) via an AsyncLocalStorage scope set per update — admin views use `usd()`.
- Order statuses sync every 5 min via pg_cron → `/api/public/cron/sync-orders`, authed by `X-Cron-Key` from `bot_secrets` — provider has no webhooks; refunds for canceled/partial apply once (guarded by `refunded = 0`).
- bKash deposits: an SMS-forwarder app POSTs official bKash SMS to `/api/public/bkash/webhook` (authed by `X-Bkash-Secret` = `bot_secrets.bkash_webhook`); `bot_bkash_sms.trx_id` UNIQUE + conditional `claimed_by IS NULL` update guarantee each TrxID credits once.

- TG accounts are bought from the Phoenix supplier in `phoenix.server.ts` (key in `bot_secrets.phoenix_api_key`); wallet is charged first and refunded on any failure, live price re-checked before buying.
- Growth features (deep links `start=p_ID`/`ref_ID`, popular pins `bot_popular`, referral reward, force-join channel in `bot_secrets.force_channel`) live in `growth.server.ts`; the referral reward is paid once, guarded by the conditional `ref_rewarded = false` update.
- Force-channel membership is checked live by sender ID on every message and callback, including bot admins; fail closed and answer Verify only once after checking, so leaving blocks the next interaction.
- Keep one separate persistent keyboard anchor per chat and replace it only after sending its successor; deleting product screens must not dismiss Telegram's keyboard.
- Additional Telegram admins are loaded from the server-only bot_admin_roles table at each update, never from editable user profiles; the owner environment allowlist remains valid.
- Channel posts use an admin-authorized preview/confirmation flow with validated product references and escaped custom text; typed product deep links reopen current products without leaking purchased credentials.
- Reseller API: `src/routes/api/public/v2.ts` → `api.server.ts` (SMM-panel actions services/add/status/balance, 16-char key in server-only `bot_api_keys`, wallet charged first and refunded on failure); docs served raw from `api-docs.md` at `/api/public/docs`.
- A second bot (Frrr TG, TG accounts only) runs on the same handler via `runAsBot("tg")` in `scope.server.ts`, entered from `/api/public/telegram/webhook2`; per-bot tables are routed to `bot2_*` copies by the scoped client in `store.server.ts` so wallets, referrals and orders never cross bots, while deposits/bKash SMS stay shared so a payment can be used only once across all bots. Bot 2 token lives in `bot_secrets.bot2_token`.

- Frrr SMS enters webhook3 under runAsBot("sms"), uses bot3_* wallets/state/history and its own settings/channel; shared payment claims remain global to prevent reuse.
- SMS reservations and refunds are transactional service-role RPCs; ambiguous purchases go to review, cancellation refunds require ACCESS_CANCEL and no stored OTP, and polling takes a per-order lock to prevent concurrent cancellation/code races.
- SMS catalog caches persist in bot3_service_cache; a fresh capped supplier price is required before purchase, never expose supplier rates to customers.

- SMS OTP polling uses one dynamically armed minute job targeting production; stop after active orders and bounded notifications drain so idle bots do not poll.

- Reseller APIs use explicit per-bot /api/public/{bot}/v2 routes and docs, scoped keys, and atomic UUID-idempotent reservations; legacy v2 stays an SMM-only alias. This prevents cross-bot wallet use and duplicate debits.
- Manual wallet adjustments capture the selected currency and exchange rate in per-bot state, validate through the shared adjustment parser, and convert once to USD; this keeps entry amounts and accounting consistent.
- Frrr SMS supplier is 5SIM behind the `grizzly.server.ts` adapter, which translates 5SIM REST into handler-style status strings; keeps the audited reservation/refund logic unchanged.
- SMS prices = supplier cost × admin `sms_multiplier` (default 3); the Telegram Mini App at `/sms` verifies `initData` with the SMS bot token before showing prices or sending a quote.
