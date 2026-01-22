# Sendmoney Bot (Towns)

A Towns Protocol bot that can **send ETH or any Base ERC20** via **user-signed** interaction requests, using natural-language messages like:

- `send 0.0001 ETH to @Cris`
- `pay 5 USDC to @Cris`
- `send 10 TOWNS to @Cris`
- `send 123 0xTokenAddress... to @Cris`

# Features

- **Natural language send/pay**: ETH + any Base ERC20 (symbol or address)
- **User-signed transactions**: bot sends a Towns `transaction` interaction request (no auto-trading)
- **Recipient resolution**: always uses `event.mentions[0].userId` → `getSmartAccountFromUserId(...)`
- **Token resolution**:
  - `0x...` token address: reads `decimals()` on-chain (and optional `symbol()`)
  - `TICKER` (e.g. `USDC`): resolves via 0x token list on Base (cached 10 minutes)

## Slash Commands

- `/help` - Shows available commands and message triggers
- `/time` - Displays the current server time

## Message Triggers (Payments)

- **DM/GDM**: always works
- **Channels**: only works when the bot is **mentioned** or you include the bot-name keyword (defaults to `speedrun`, configurable via `BOT_NAME`)

Important: if your bot is configured for **Mentions/Commands** message behavior, `onMessage` only fires when mentioned. If you want keyword triggers without mentions, switch the bot to **All Messages** in the Towns Developer Portal.

## Reaction Handling

- React with 👋 to any message - Bot responds with "I saw your wave!"

# Local Setup

1. Install dependencies:

   ```bash
   bun install
   ```

2. Set env vars:

- `APP_PRIVATE_DATA` (base64)
- `JWT_SECRET` (webhook secret)
- Optional: `BASE_RPC_URL` (recommended custom Base RPC)
- Optional: `BOT_NAME` (keyword trigger in channels)

3. Run the bot:

   ```bash
   bun run dev
   ```

# Environment Variables

- `APP_PRIVATE_DATA` - Your Towns app private data (base64 encoded)
- `JWT_SECRET` - JWT secret for webhook authentication
- `PORT` - Port to run the bot on (Render sets this automatically)
- `BASE_RPC_URL` - Optional custom Base RPC URL (recommended)
- `BOT_NAME` - Optional channel keyword trigger (defaults to `speedrun`)

# Deploy to Render

This repo is set up for Render using **Node 20+**:

- Build: `npm run build` (compiles TypeScript to `dist/`)
- Start: `npm run start` (runs `node dist/server.js`)
- Health check: `GET /health`

## Render Steps

1. Create a new **Web Service** on Render from this GitHub repo.
2. Render will detect `render.yaml`, or you can set:
   - Build Command: `npm install && npm run build`
   - Start Command: `npm run start`
3. Set env vars in Render (mark secrets as Secret):
   - `APP_PRIVATE_DATA`
   - `JWT_SECRET`
   - Optional: `BASE_RPC_URL`
   - Optional: `BOT_NAME`
4. In the Towns Developer Portal, set your bot’s webhook base URL to your Render URL, and ensure the webhook path is:
   - `https://<your-render-service>.onrender.com/webhook`

# Usage

Once the bot is running, installed to a space and added to a channel:

**Try the slash commands:**

- `/help` - See all available features
- `/time` - Get the current time

**Try the message triggers:**

- Type "hello" anywhere in your message
- Type "ping" to check bot latency
- Type "react" to get a reaction

**Try reactions:**

- Add a 👋 reaction to any message

# Code Structure

The bot consists of two main files:

## `src/commands.ts`

Defines the slash commands available to users. Commands registered here appear in the slash command menu.

## `src/index.ts`

Main bot logic with:

1. **Bot initialization** (`makeTownsBot`) - Creates bot instance with credentials and commands
2. **Slash command handlers** (`onSlashCommand`) - Handle `/help` and `/time` commands
3. **Message handler** (`onMessage`) - Respond to message keywords (hello, ping, react)
4. **Reaction handler** (`onReaction`) - Respond to emoji reactions (👋)
5. **Bot server setup** (`bot.start()`) - Starts the bot server with a Hono HTTP server

## Extending this Bot

To add your own features:

1. **Add a slash command:**
   - Add to `src/commands.ts`
   - Go to `src/index.ts` and create a handler with `bot.onSlashCommand('yourcommand', async (handler, event) => { ... })`

2. **Add message triggers:**
   - Add conditions in the `bot.onMessage()` handler

3. **Handle more events:**
   - Use `bot.onReaction()`, `bot.onMessageEdit()`, `bot.onChannelJoin()`, etc.
