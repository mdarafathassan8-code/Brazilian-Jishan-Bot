# Brazilian Jisan Bot — Separate Admin Panel

This directory is reserved for the independent admin panel.

## Features
- Separate admin area and database configuration
- Payment request review with Accept / Reject
- Accepted payments can move the user to the next access step
- Rejected payments show a clear rejection status
- Bengali is the default language; English can be selected
- No dependency on the legacy JISANs-BOT admin panel/database

## Environment variables
Configure the new Turso database only through deployment environment variables:
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`

Do not commit secrets to this repository.
