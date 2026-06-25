# Solana Memecoin Radar 🚀

Local-only Solana memecoin scanner built with Node.js, MySQL/MariaDB, and Telegram alerts.

It scans new tokens, enriches them with market/risk data, scores each token from 0–100, and sends BUY / WATCH / AVOID signals to Telegram.

## Features

- Auto-scan new Solana tokens every 5 minutes
- Multi-factor scoring from 0–100
- DexScreener price, liquidity, volume, and market cap lookup
- RugCheck risk detection
- Groq AI analysis with Gemini fallback
- Telegram alerts in Bahasa Indonesia
- Portfolio tracking with `/buy`, `/sell`, and `/portfolio`
- Stop loss, take profit, and ATH drop monitoring every 2 minutes
- Max 5 active positions at once

## Telegram Commands

- `/buy <token_address> <entry_price> <tp_percent>` — confirm entry and start tracking
- `/sell <token_address>` — close a position manually
- `/portfolio` — show all active holdings and P&L
- `/help` — show command guide

> Jika kamu sudah menambahkan `/start`, `/status`, atau `/config`, tampilkan juga di bot Telegram setelah fitur tersebut aktif.

## Scoring

- Liquidity: max 15 pts
- Volume: max 15 pts
- Market Cap: max 15 pts
- Top Holder %: max 25 pts
- Buy/Sell Ratio: max 20 pts
- Smart Wallet: max 20 pts
- Whale Entry: max 15 pts
- RugCheck: +10 for SAFE, -50 for RISK

Signal thresholds:

- `BUY` — score ≥ 70
- `WATCH` — score 60–69
- `AVOID` — score < 60

## Data Sources

- Helius — token discovery
- DexScreener — price, liquidity, volume, market cap
- RugCheck — risk checks
- Groq — primary AI summary
- Google Gemini — fallback AI summary
- Telegram Bot API — alerts and commands

## Quick Start

1. Install dependencies
   ```bash
   npm install
   ```
2. Copy environment file
   ```bash
   cp .env.example .env
   ```
3. Fill `.env` with your API keys and Telegram info
4. Import database schema
   ```bash
   npm run db:import
   ```
5. Start the bot
   ```bash
   npm start
   ```

## Environment

Required variables live in `.env.example`:

- `DB_HOST=127.0.0.1`
- `DB_PORT=3306`
- `DB_USER=root`
- `DB_PASSWORD=`
- `DB_NAME=memecoin_scanner`
- `HELIUS_API_KEY=`
- `GROQ_API_KEY=`
- `GEMINI_API_KEY=`
- `TELEGRAM_BOT_TOKEN=`
- `TELEGRAM_CHAT_ID=`

## Database

Schema lives in `database/schema.sql` and uses MariaDB-compatible SQL for XAMPP.

## Notes

- This project is for local development only.
- No keys are committed to the repo.
- MySQL host is `127.0.0.1` for XAMPP compatibility.

## Disclaimer

Educational use only. Not financial advice.

## Dashboard

KeyScanner coin includes a local Aether-inspired dashboard with a dark blue professional theme.

Start the API:
```bash
npm run api
```

Start the React dashboard:
```bash
npm run dashboard:dev
```

Open:
```text
http://127.0.0.1:5173
```

Dashboard data flow:
```text
Bot Scanner → MySQL → Fastify API → React Dashboard
```

Phase 1 includes sidebar navigation, portfolio overview, market pulse, score history chart, risk index, P&L, and confidence score.
