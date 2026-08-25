# Brazilian Jishan Bot

A separate Brazilian-themed market dashboard and purchase portal. This repository is intentionally independent from `JISANs-BOT`.

## Features
- Brazilian-inspired floating flag UI
- $20 purchase flow with manual payment proof
- Admin approval and credential issuance
- One-device credential binding
- Login / Buy landing screen
- OTC timeframes: 5s, 10s, 15s, 30s, 1m, 5m
- Real/non-OTC timeframes: 1m, 5m
- Market dashboard and signal-generation UI
- Server-side API structure for live market integration

## Important
Signal direction in this initial build is clearly presented as a generated/demo result, not a guaranteed prediction. The project does not place trades automatically.

## Environment
Copy `.env.example` to your deployment environment and set secrets there. Never commit SSIDs, passwords, private keys, or admin secrets.
