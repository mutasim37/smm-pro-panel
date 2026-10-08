# Frrr SMM — Reseller API v2

## Dedicated endpoint

`https://smm-pro-panel.lovable.app/api/public/smm/v2`

Documentation: `https://smm-pro-panel.lovable.app/api/public/smm/docs`

This endpoint only serves Frrr SMM; keys, wallets and order histories are isolated.

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
- `balance`: USD balance.
- `services`: list SMM services; optional `services` is comma-separated service IDs. `rate` is the customer price per 1000, with markup already included. `min`, `max`, `type`, `refill`, `cancel` describe the service.
- `add`: `service` integer, `link` (maximum 500 characters), `quantity` integer, `request_id` UUID. Custom-comment services require `comments`, one per line; quantity becomes line count. Respect the service bounds. Charge = rate × quantity / 1000, except service-specific quantity-free types.
- `status`: `order` UUID, or `orders` comma-separated UUIDs (maximum 100); only your orders are returned. SMM status is refreshed in the background approximately every 5 minutes.

```json
{"action":"add","service":123,"link":"https://www.instagram.com/example/","quantity":100,"request_id":"3bdaeddb-ac0d-42c9-851d-cf8e9a9ee2dd"}
```
The service ID above is illustrative: use a real ID from `services`. Successful add returns `order`, `status`, `charge`, `currency`. Status returns `charge`, `start_count`, `remains`, and status. A confirmed rejection refunds the charge; an uncertain purchase becomes Review.
