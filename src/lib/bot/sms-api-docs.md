# Frrr SMS — Reseller API v2

## Dedicated endpoint

`https://smm-pro-panel.lovable.app/api/public/sms/v2`

Documentation: `https://smm-pro-panel.lovable.app/api/public/sms/docs`

This endpoint only serves Frrr SMS; keys, wallets and order histories are isolated.

## Authentication and safety
Open this bot → Profile/Account → API Access → Generate Key. Keys have 16 characters and work only with this bot. Regenerating revokes the old key. Send `X-API-Key` privately over HTTPS; never put credentials in public URLs, front-end code or logs.

POST JSON or form-encoded parameters. Responses are JSON. CORS supports browser requests, but keep keys on your own server. All money is USD, including displayed prices, charges and balances. Top up the matching bot using bKash or USDT. Balances never transfer between these APIs.

`balance` works even with zero funds. Catalog access and new purchases require a positive balance. Purchases also require enough for the complete charge. Existing paid orders remain accessible at zero balance. Banned accounts are blocked.

Every `add` requires `request_id`: a new UUID for a new purchase. Reuse the SAME UUID if the response is uncertain; never generate another UUID to retry the same purchase. The wallet is charged atomically before contacting the supplier. An uncertain response is held for admin review, not silently retried or refunded. Use Support for a Review order.

## Request examples
```bash
# Set API_KEY privately on your own server. Never publish it.
curl -X POST "$BASE" -H "X-API-Key: $API_KEY" -H 'Content-Type: application/json' -d '{"action":"balance"}'
```
```python
import os, uuid, requests
base = os.environ["FRRR_API_URL"]
headers = {"X-API-Key": os.environ["FRRR_API_KEY"]}
balance = requests.post(base, headers=headers, json={"action":"balance"}).json()
# Create and persist one UUID before a new order.
request_id = str(uuid.uuid4())
```

## Errors and support
401: invalid key or a key belonging to another bot. 402: insufficient wallet balance for access. 403: account blocked. 400/413: invalid/oversized request. 503: supplier/server unavailable; do not repeat a purchase with a new UUID. Business errors may return JSON `{ "error": "..." }` with HTTP 200; always check the response body. `Review` means reserved funds require reconciliation. No automated retry of purchases.
Never disclose your key or someone else's phone/OTP. Only your own paid orders can be read. Contact @Frreohi inside Telegram for unresolved orders.

## Actions
- `balance`: this SMS bot's USD wallet.
- `services`: live stock; optional `service` code and/or numeric-string `country` filter. Each row contains service, name, country, country_name, stock and final customer `price` in USD. The default markup is 30%, admin-editable.
- `add`: service code, country ID from catalog, request_id UUID. One activation. Wallet is charged before provider purchase, current stock and price rechecked. Returns order UUID, phone, charge and Waiting status.
- `orders`: up to the latest 50 owned numbers.
- `status` or `otp`: `order` UUID. Returns id, phone, status, otp (null while waiting), charge, refunded and expires_at.
- `cancel`: `order` UUID. Cancellation cannot succeed in the first five minutes and remains subject to provider approval. Never refunded after OTP. Once refunded, `otp` no longer returns a code. Read the returned status rather than assuming success.

```json
{"action":"add","service":"tg","country":"0","request_id":"3bdaeddb-ac0d-42c9-851d-cf8e9a9ee2dd"}
```
Service and country here are examples; use live catalog values. Activation window targets 20 minutes. Expiry triggers a cancellation request, NOT an unconditional refund. Only explicit supplier cancellation confirmation without OTP returns money. Provider cancellations that cannot be confirmed go to Review. OTP is checked automatically once per minute only while active orders exist, and also when you request status. Telegram OTP notification delivery is best effort; the API lets you read your order even if Telegram delivery fails. No webhook callback to reseller servers is currently provided.
