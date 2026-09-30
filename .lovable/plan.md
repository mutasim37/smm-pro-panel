# Admin exchange rates and clean Telegram navigation

## What will change
- Add an admin-only **Exchange Rates** option for changing the BDT and INR values used across balances and prices.
- Save those rates centrally so changes apply to every user without redeploying.
- Make button-based navigation reuse the current Telegram message: text messages are edited, while photo screens are replaced cleanly when Telegram cannot convert them.
- Keep user-typed replies as inputs, but remove the previous bot prompt before showing the next order/payment step where possible.
- Remove the extra “control keyboard is ready” message so opening the bot stays compact.

## Technical details
- Add a locked service-only settings table with seeded BDT/INR rates.
- Resolve display rates per update and pass them through the existing currency formatting scope.
- Add Telegram helpers for caption editing and safe message deletion, with edit/delete/send fallbacks.
- Track the active bot prompt message during text-entry flows so completed prompts can be removed.
- Verify compilation and exercise callback navigation behavior against the live preview endpoint.
