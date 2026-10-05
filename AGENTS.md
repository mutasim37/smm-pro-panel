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

- The Telegram bot lives in `src/lib/bot/*.server.ts` and is driven by one public
  webhook route (`src/routes/api/public/telegram/webhook.ts`) — keeps all bot
  logic server-only and off the client bundle.
- The webhook is authenticated with `base64url(sha256("telegram-webhook:" + TELEGRAM_BOT_TOKEN))`
  sent in `X-Telegram-Bot-Api-Secret-Token`; no other auth layer guards it.
- Provider (SMMGen) prices are multiplied by `PRICE_MARKUP_PERCENT` in
  `catalog.server.ts` before any user sees them — never show raw provider rates.
- The service catalog is cached in memory (15 min) with a `bot_service_cache`
  DB fallback (6 h) so updates stay fast without hammering the provider.
- USDT (BEP20) deposits are verified through public BSC JSON-RPC nodes in
  `bsc.server.ts` — no third-party explorer API key is required.
- `bot_deposits.tx_hash` is UNIQUE: that constraint is the only thing preventing
  a transaction hash from being credited twice.
- All money is stored in USD; `money()` renders it in the user's chosen currency (BDT/INR/USD) via an AsyncLocalStorage scope set per update — admin views use `usd()`.
- Order statuses sync every 5 min via pg_cron → `/api/public/cron/sync-orders`, authed by `X-Cron-Key` from `bot_secrets` — provider has no webhooks; refunds for canceled/partial apply once (guarded by `refunded = 0`).
- bKash deposits: an SMS-forwarder app POSTs official bKash SMS to `/api/public/bkash/webhook` (authed by `X-Bkash-Secret` = `bot_secrets.bkash_webhook`); `bot_bkash_sms.trx_id` UNIQUE + conditional `claimed_by IS NULL` update guarantee each TrxID credits once.
