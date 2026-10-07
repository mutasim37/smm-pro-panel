# XNOVA SMM — Reseller API v2

Connect your own panel, website or app to XNOVA SMM and place orders automatically.
Orders are paid from your **XNOVA wallet balance** (USD). Top up inside the Telegram bot.

---

## 1. Base URL

```
https://smm-pro-panel.lovable.app/api/public/v2
```

All requests are `POST`. Send parameters as `application/x-www-form-urlencoded`
(standard SMM panel format) **or** as JSON. Every response is JSON.

## 2. Authentication

Open the bot → **👤 Profile** → **🔑 API Access** → **Generate Key**.
Your key is exactly **16 characters**. Send it as the `key` parameter on every request
(or the `X-API-Key` header). Keep it secret — anyone with the key can spend your balance.
Tap **Regenerate** to revoke the old key instantly.

## 3. Choosing your products

Every service has a unique **Product Code** (shown on each product page in the bot).
You do **not** have to import the whole catalog — pass the codes you want in `services`
and only those are returned. Order any code you like with `action=add`.

---

## 4. Actions

### 4.1 Service list — `action=services`

| Param | Required | Description |
|---|---|---|
| key | yes | Your API key |
| action | yes | `services` |
| services | no | Comma-separated product codes, e.g. `1024,2048`. Omit for the full catalog |

```json
[
  {
    "service": 1024,
    "name": "Instagram Followers | Real",
    "type": "Default",
    "category": "Instagram Followers",
    "rate": "0.8400",
    "min": 100,
    "max": 100000,
    "refill": true,
    "cancel": false
  }
]
```
`rate` is the USD price per 1000 units, already including our fee.

### 4.2 Add order — `action=add`

| Param | Required | Description |
|---|---|---|
| service | yes | Product code |
| link | yes | Target link / username |
| quantity | yes* | Amount (between min and max) |
| comments | for custom-comment services | One comment per line (`\n`); quantity = number of lines |

```json
{ "order": "8f1c2e90-...", "charge": "0.0840", "currency": "USD", "balance": "12.3456" }
```
Your wallet is charged instantly. If the order fails at the supplier, the charge is refunded automatically.

### 4.3 Order status — `action=status`

| Param | Required | Description |
|---|---|---|
| order | one of | A single order ID |
| orders | one of | Up to 100 comma-separated order IDs |

```json
{ "order": "8f1c...", "status": "In progress", "charge": "0.0840", "start_count": "120", "remains": "40", "currency": "USD" }
```
With `orders` you receive an object keyed by order ID.
Statuses: `Pending`, `Processing`, `In progress`, `Completed`, `Partial`, `Canceled`.
Canceled/partial orders are refunded to your balance automatically.

### 4.4 Balance — `action=balance`

```json
{ "balance": "12.3456", "currency": "USD" }
```

---

## 5. Notifications

Every API order also appears in **📦 My Orders** in the bot, and you get a Telegram
message the moment it completes, is partially delivered or is canceled.

## 6. Errors

Errors return `{ "error": "message" }` with HTTP 200 (panel standard), e.g.:

| Error | Meaning |
|---|---|
| `Invalid API key` | Wrong / revoked key |
| `Incorrect service ID` | Product code does not exist |
| `Quantity must be between X and Y` | Out of range |
| `Not enough funds on balance` | Top up in the bot |
| `Order not found` | ID does not belong to your account |

## 7. Examples

**cURL**
```bash
curl -X POST https://smm-pro-panel.lovable.app/api/public/v2 \
  -d key=YOUR16CHARKEY -d action=add -d service=1024 \
  -d link=https://instagram.com/username -d quantity=1000
```

**Python**
```python
import requests
API = "https://smm-pro-panel.lovable.app/api/public/v2"
r = requests.post(API, data={"key": "YOUR16CHARKEY", "action": "balance"})
print(r.json())
```

**PHP**
```php
$ch = curl_init("https://smm-pro-panel.lovable.app/api/public/v2");
curl_setopt($ch, CURLOPT_POST, 1);
curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([
  "key" => "YOUR16CHARKEY", "action" => "status", "order" => "ORDER_ID"
]));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
echo curl_exec($ch);
```

**JavaScript**
```js
const res = await fetch("https://smm-pro-panel.lovable.app/api/public/v2", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ key: "YOUR16CHARKEY", action: "services", services: "1024,2048" }),
});
console.log(await res.json());
```

Support: https://t.me/Frreohi
