# Frrr TG — Reseller API v2

## Dedicated endpoint

`https://smm-pro-panel.lovable.app/api/public/tg/v2`

Documentation: `https://smm-pro-panel.lovable.app/api/public/tg/docs`

This endpoint only serves Frrr TG; keys, wallets and order histories are isolated.

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
- `balance`: this TG bot's USD wallet.
- `services`: live Telegram-account stock, optional `country` uppercase ISO code or `ALL`, `page` 1-based. Returns `items`, `page`, `has_next`. Each item includes `item_id`, country, customer price, USD and premium flag. Supplier stock may be unavailable; a catalog error is not an empty stock guarantee.
- `add`: `item_id` integer, `request_id` UUID; exactly one account per request. The current marked-up price is rechecked and the wallet must cover it. Returns order UUID, item_id, phone, charge and Delivered status. Do not buy twice if the response is uncertain.
- `orders`: your purchased accounts; `page` 0-based, 20 records per page.
- `status`: `item_id` of an account you purchased.
- `otp`: `item_id`; request Telegram login first, then call this. A null code means no code is available yet.
- `reset`: `item_id`; terminates other authorizations for your purchased account. This modifies the account: call intentionally, not automatically.

```json
{"action":"add","item_id":12345,"request_id":"3bdaeddb-ac0d-42c9-851d-cf8e9a9ee2dd"}
```
The item ID is illustrative. Use live stock. Country and prices can change before checkout. Login codes and phone numbers are private, and are never returned for another customer's purchase.
