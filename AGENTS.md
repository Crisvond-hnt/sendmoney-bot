# Towns Protocol Bot SDK Reference

> Complete reference for building Towns Protocol bots with @towns-protocol/bot SDK

**Version**: 2.2 | **Updated**: December 2025 | **Lines**: ~1,620 | **Language**: TypeScript

---

## 0. LLM Instructions

**Role**: Towns Protocol development assistant with expert knowledge of bot and miniapp development.

**Required Behavior**:
1. Use section numbers (e.g., "See §4.2") to cite information
2. Search keyword lists to locate topics quickly
3. Check Quick Reference (§1) before reading full sections
4. **BEFORE implementing any feature, search this document for relevant sections**
5. **For miniapps: ALWAYS use §15 and Appendix B.4 template - never invent SDK methods**
6. Provide complete TypeScript code with proper imports
7. Never invent API methods not documented here

**Critical Rules**:
- User IDs are ALWAYS Ethereum addresses (0x...)
- Bots have TWO wallets: gas wallet (MUST fund with Base ETH) + treasury (optional, for transfers)
- Interactive requests use `type` property (e.g., `type: 'form'`, `type: 'transaction'`)
- Private interactions use `recipient: userId` in payload
- Payment verification: ALWAYS verify transactions on-chain with `waitForTransactionReceipt` before granting access (see §10.5)

**Common Workflows**:
- **Bot with commands**: §4.3 initialization → §8.1 define commands → §8.2 handle commands
- **Interactive forms**: §9.1 send form → §9.3 handle response
- **Payment acceptance**: §10.1 request transaction → §10.5 verify on-chain → grant access
- **Bot with miniapp**: Add `/dashboard` command (§2.10) → §15.1 meta tag → §15.2 SDK init → B.4 template
- **Blockchain operations**: §12.2 execute transaction → verify receipt

---

## 1. Quick Reference

Keywords: API reference, method signatures, quick lookup, cheat sheet

### 1.1 Handler Methods (inside event handlers)

| Method | Signature | Notes |
|--------|-----------|-------|
| `sendMessage` | `(channelId, text, opts?) → { eventId }` | opts: `{ threadId?, replyId?, mentions?, attachments?, ephemeral? }` |
| `editMessage` | `(channelId, eventId, text, opts?)` | Bot's own messages only |
| `removeEvent` | `(channelId, eventId)` | Bot's own messages only |
| `adminRemoveEvent` | `(channelId, eventId)` | Any message, needs Permission.Redact |
| `sendReaction` | `(channelId, messageId, emoji)` | |
| `pinMessage` | `(channelId, eventId, streamEvent)` | |
| `unpinMessage` | `(channelId, eventId)` | |
| `sendInteractionRequest` | `(channelId, payload)` | Forms, transactions, signatures |
| `sendTip` | `({ userId, amount, messageId, channelId, currency? })` | currency defaults to ETH |
| `hasAdminPermission` | `(userId, spaceId) → boolean` | |
| `checkPermission` | `(channelId, userId, Permission) → boolean` | |
| `ban` | `(userId, spaceId)` | Needs ModifyBanning |
| `unban` | `(userId, spaceId)` | Needs ModifyBanning |
| `createChannel` | `(spaceId, opts) → channelId` | opts: `{ name, description?, autojoin?, hideUserJoinLeaveEvents? }` |

### 1.2 Bot Properties

| Property | Type | Description |
|----------|------|-------------|
| `bot.viem` | ViemClient | Viem client for blockchain |
| `bot.viem.account` | Account | Gas wallet (EOA) - signs & pays fees - **MUST fund with Base ETH** |
| `bot.appAddress` | string | Treasury (Smart Account) - optional, holds funds for transfers |
| `bot.botId` | string | Bot identifier |

### 1.3 Key Imports

```typescript
// Bot SDK
import { makeTownsBot, getSmartAccountFromUserId } from '@towns-protocol/bot'
import type { BotCommand, BotHandler } from '@towns-protocol/bot'
import simpleAppAbi from '@towns-protocol/bot/simpleAppAbi'

// Permissions
import { Permission, Rules } from '@towns-protocol/web3'

// Viem
import { parseEther, formatEther, encodeFunctionData, erc20Abi, zeroAddress } from 'viem'
import { readContract, waitForTransactionReceipt } from 'viem/actions'
import { execute } from 'viem/experimental/erc7821'
```

### 1.4 Token Addresses (Base Mainnet)

```typescript
import { zeroAddress } from 'viem'

const TOKENS = {
  ETH: zeroAddress,  // Native ETH (0x0000000000000000000000000000000000000000)
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  USDT: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
  WETH: '0x4200000000000000000000000000000000000006',
  TOWNS: '0x00000000A22C618fd6b4D7E9A335C4B96B189a38'
}
```

---

## 2. Common Patterns

Keywords: code snippets, examples, patterns, templates, copy-paste

### 2.1 Send Message with Mention

```typescript
await handler.sendMessage(channelId, `Hello <@${userId}>!`, {
  mentions: [{ userId, displayName: 'User' }]
})
```

### 2.2 Reply in Thread

```typescript
await handler.sendMessage(channelId, 'Reply text', { threadId: event.eventId })
```

### 2.3 Check Admin Before Action

```typescript
const isAdmin = await handler.hasAdminPermission(event.userId, event.spaceId)
if (!isAdmin) {
  await handler.sendMessage(event.channelId, '❌ Admin only')
  return
}
```

### 2.4 Get User's Wallet

```typescript
import { getSmartAccountFromUserId } from '@towns-protocol/bot'
const wallet = await getSmartAccountFromUserId(bot, { userId: event.userId })
```

### 2.5 Send Button Form

```typescript
await handler.sendInteractionRequest(channelId, {
  type: 'form',
  id: 'my-form',
  components: [
    { id: 'yes', type: 'button', label: 'Yes' },
    { id: 'no', type: 'button', label: 'No' }
  ]
})
```

### 2.6 Handle Button Response

```typescript
bot.onInteractionResponse(async (handler, event) => {
  if (event.response.payload.content?.case !== 'form') return
  const form = event.response.payload.content.value
  if (form.id !== 'my-form') return
  
  for (const c of form.components) {
    if (c.component.case === 'button' && c.id === 'yes') {
      await handler.sendMessage(event.channelId, 'You clicked Yes!')
    }
  }
})
```

### 2.7 Read Contract

```typescript
import { readContract } from 'viem/actions'
const balance = await readContract(bot.viem, {
  address: tokenAddress,
  abi: erc20Abi,
  functionName: 'balanceOf',
  args: [userAddress]
})
```

### 2.8 Execute Transaction (Bot Wallet)

```typescript
import { execute } from 'viem/experimental/erc7821'
const hash = await execute(bot.viem, {
  address: bot.appAddress,
  account: bot.viem.account,
  calls: [{ to: targetAddress, abi, functionName: 'transfer', args: [...] }]
})
```

### 2.9 Send Miniapp

```typescript
await handler.sendMessage(channelId, 'Open app:', {
  attachments: [{ type: 'miniapp', url: 'https://your-app.com/miniapp.html' }]
})
```

### 2.10 Dashboard Command (Miniapp)

When your bot has a miniapp dashboard, add a command so users can easily open it:

```typescript
bot.onSlashCommand('dashboard', async (handler, event) => {
  await handler.sendMessage(event.channelId, 'Open your dashboard:', {
    attachments: [{
      type: 'miniapp',
      url: process.env.MINIAPP_URL || 'https://your-app.com/miniapp.html'
    }]
  })
})
```

### 2.11 Welcome New User

```typescript
bot.onChannelJoin(async (handler, event) => {
  await handler.sendMessage(event.channelId, `Welcome <@${event.userId}>! 👋`, {
    mentions: [{ userId: event.userId, displayName: 'User' }]
  })
})
```

---

## 3. Index

| § | Section | Keywords |
|---|---------|----------|
| 4 | Architecture & Setup | initialization, wallets, gas, treasury, deployment |
| 5 | Message Forwarding | modes, all messages, mentions, filtering |
| 6 | Event Handlers | onMessage, onSlashCommand, onReaction, onTip, onStreamEvent |
| 7 | Messaging API | sendMessage, mentions, threads, attachments, markdown |
| 8 | Slash Commands | /commands, arguments, paid commands, x402 |
| 9 | Interactive Components | forms, buttons, text inputs, public/private, polls |
| 10 | Transaction Requests | user transactions, ERC20, token transfers, parameters |
| 11 | Signature Requests | EIP-712, personal_sign, authentication, parameters |
| 12 | Blockchain Operations | readContract, execute, writeContract, tips |
| 13 | Permissions & Moderation | Permission, ban, unban, admin, React, Invite |
| 14 | Roles & Token Gating | createRole, Rules API, NFT gating |
| 15 | Miniapps | iframe, SDK, HTML, wallet provider, multi-wallet |
| 16 | Linked Wallets | smart accounts, EOA, linkedWallets |
| 17 | Snapshot Data | cache, getChannelInception, getUserMemberships |
| 18 | External Integrations | webhooks, timers, Hono routes |
| 19 | Troubleshooting | errors, debugging, common mistakes |
| B | Full Templates | complete bot examples, miniapp template |

---

## 4. Architecture & Setup

Keywords: initialization, bot wallets, gas wallet, treasury, makeTownsBot, deployment, environment

### 4.1 Bot Wallet Architecture

Every bot has TWO addresses:

| Property | Type | Role | Fund With |
|----------|------|------|-----------|
| `bot.viem.account.address` | EOA (Gas Wallet) | Signs & pays gas fees | **Base ETH (REQUIRED)** |
| `bot.appAddress` | Smart Account (Treasury) | Holds funds for transfers | Base ETH + tokens (optional) |

**CRITICAL:** Your gas wallet (`bot.viem.account.address`) **MUST** be funded with Base ETH for transaction fees. The treasury (`bot.appAddress`) is only needed if your bot sends tokens/payments to users.

### 4.2 Project Setup

```bash
# Create bot at https://app.towns.com/developer
# Save APP_PRIVATE_DATA and JWT_SECRET

bunx towns-bot init my-bot
cd my-bot
bun install
```

### 4.3 Initialization

```typescript
import { makeTownsBot } from '@towns-protocol/bot'
import type { BotCommand } from '@towns-protocol/bot'

const commands = [
  { name: 'help', description: 'Show help' },
  { name: 'ping', description: 'Check if alive' }
] as const satisfies BotCommand[]

const bot = await makeTownsBot(
  process.env.APP_PRIVATE_DATA!,
  process.env.JWT_SECRET!,
  {
    commands,
    baseRpcUrl: process.env.BASE_RPC_URL,  // Recommended: custom RPC
    identity: {
      name: 'My Bot',
      description: 'A helpful bot',
      image: 'https://example.com/avatar.png'
    }
  }
)

const app = bot.start()
export default app
```

### 4.4 Environment Variables

```bash
APP_PRIVATE_DATA=<base64_credentials>
JWT_SECRET=<webhook_secret>
PORT=3000
BASE_URL=https://mybot.onrender.com
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/KEY  # Recommended
```

### 4.5 Check Balances

```typescript
import { formatEther } from 'viem'

const gasBalance = await bot.viem.getBalance({ address: bot.viem.account.address })
const treasuryBalance = await bot.viem.getBalance({ address: bot.appAddress })
console.log(`Gas: ${formatEther(gasBalance)} ETH`)
console.log(`Treasury: ${formatEther(treasuryBalance)} ETH`)
```

---

## 5. Message Forwarding Modes

Keywords: forwarding, all messages, mentions only, filtering, Developer Portal

Configure at https://app.towns.com/developer

| Mode | Receives | Available Handlers |
|------|----------|-------------------|
| **All Messages** | Everything | All handlers including onTip, onChannelJoin/Leave |
| **Mentions/Commands** (Default) | Mentions, replies, reactions, commands | onMessage (filtered), onSlashCommand, onReaction |
| **No Messages** | Nothing | Bot can still SEND messages |

**Note**: `onTip`, `onChannelJoin`, `onChannelLeave`, `onEventRevoke` require "All Messages" mode.

---

## 6. Event Handlers

Keywords: onMessage, onSlashCommand, onReaction, onTip, onInteractionResponse, onChannelJoin, onChannelLeave, events

### 6.1 Base Payload (All Events)

```typescript
interface BasePayload {
  userId: string      // Sender address (0x...)
  spaceId: string
  channelId: string
  eventId: string     // Use for threadId/replyId
  createdAt: Date
}
```

### 6.2 onMessage

Triggers on regular messages (NOT slash commands).

```typescript
bot.onMessage(async (handler, event) => {
  // event.message: string
  // event.isMentioned: boolean
  // event.mentions: Array<{ userId, displayName }>
  // event.threadId?: string
  // event.replyId?: string
  
  if (event.isMentioned) {
    await handler.sendMessage(event.channelId, 'You mentioned me!')
  }
})
```

### 6.3 onSlashCommand

Triggers on `/command args`. Does NOT trigger onMessage.

```typescript
bot.onSlashCommand('ping', async (handler, event) => {
  // event.command: string (without /)
  // event.args: string[]
  // event.mentions: Array<{ userId, displayName }>
  
  const latency = Date.now() - event.createdAt.getTime()
  await handler.sendMessage(event.channelId, `Pong! 🏓 (${latency}ms)`)
})
```

### 6.4 onReaction

Triggers on emoji reactions. No access to original message content.

```typescript
bot.onReaction(async (handler, event) => {
  // event.reaction: string (emoji or name like "thumbsup")
  // event.messageId: string
  
  if (event.reaction === '👍') {
    await handler.sendReaction(event.channelId, event.messageId, '🎉')
  }
})
```

### 6.5 onTip

Triggers on cryptocurrency tips. **Requires "All Messages" mode.**

```typescript
import { formatEther, zeroAddress } from 'viem'

bot.onTip(async (handler, event) => {
  // event.messageId, senderAddress, receiverAddress, amount (bigint), currency
  
  const isForBot = event.receiverAddress === bot.appAddress
  if (isForBot) {
    const amount = formatEther(event.amount)
    await handler.sendMessage(event.channelId, `💰 Thanks for ${amount} ETH!`)
  }
})
```

### 6.6 onInteractionResponse

Triggers on button clicks, form submits, transaction/signature responses.

```typescript
bot.onInteractionResponse(async (handler, event) => {
  const { response } = event
  
  switch (response.payload.content?.case) {
    case 'form':
      // Handle buttons/text inputs (see §9)
      break
    case 'transaction':
      // Handle tx result (see §10)
      break
    case 'signature':
      // Handle signature (see §11)
      break
  }
})
```

### 6.7 Other Handlers

| Handler | Trigger | Requires |
|---------|---------|----------|
| `onMessageEdit` | Message edited | - |
| `onRedaction` | Message deleted | - |
| `onEventRevoke` | Message revoked | All Messages mode |
| `onChannelJoin` | User joins | All Messages mode |
| `onChannelLeave` | User leaves | All Messages mode |
| `onStreamEvent` | Any raw event | Advanced use |

### 6.8 onStreamEvent (Advanced)

Low-level handler for raw events:

```typescript
bot.onStreamEvent(async (handler, event) => {
  // event.event: ParsedEvent (raw protocol event)
  // Use for custom event processing not covered by other handlers
})
```

---

## 7. Messaging API

Keywords: sendMessage, mentions, threads, replies, attachments, images, videos, markdown, editing

### 7.1 Basic Message

```typescript
const { eventId } = await handler.sendMessage(channelId, 'Hello!')

// With markdown
await handler.sendMessage(channelId, '**Bold** *Italic* `code`')
```

### 7.2 Mentions

**MUST include BOTH formatted text AND mentions array:**

```typescript
// Single mention
await handler.sendMessage(channelId, `Hello <@${userId}>!`, {
  mentions: [{ userId, displayName: 'Alice' }]
})

// Multiple mentions
await handler.sendMessage(channelId, `Hey <@${user1}> and <@${user2}>!`, {
  mentions: [
    { userId: user1, displayName: 'Alice' },
    { userId: user2, displayName: 'Bob' }
  ]
})

// @channel
await handler.sendMessage(channelId, 'Attention!', {
  mentions: [{ atChannel: true }]
})
```

### 7.3 Threads & Replies

```typescript
// Reply in thread
await handler.sendMessage(channelId, 'Thread reply', { threadId: eventId })

// Reply to specific message
await handler.sendMessage(channelId, 'Reply', { replyId: messageId })

// Both
await handler.sendMessage(channelId, 'Reply in thread', {
  threadId: threadEventId,
  replyId: messageEventId
})
```

### 7.4 Ephemeral Messages

Not stored in channel history:

```typescript
await handler.sendMessage(channelId, 'Temporary message', { ephemeral: true })
```

### 7.5 Attachments

```typescript
// Image
attachments: [{ type: 'image', url: 'https://...jpg', alt: 'Description' }]

// Link
attachments: [{ type: 'link', url: 'https://docs.towns.com' }]

// Miniapp
attachments: [{ type: 'miniapp', url: 'https://your-app.com/miniapp.html' }]

// Video/Large file (chunked)
import { readFileSync } from 'node:fs'
attachments: [{
  type: 'chunked',
  data: readFileSync('./video.mp4'),  // Uint8Array
  filename: 'video.mp4',
  mimetype: 'video/mp4',              // Required for Uint8Array
  width: 1920,                        // Optional
  height: 1080
}]
```

### 7.6 Edit & Delete

```typescript
// Edit (bot's own only)
await handler.editMessage(channelId, eventId, 'New text')

// Delete (bot's own)
await handler.removeEvent(channelId, eventId)

// Admin delete (needs Permission.Redact)
await handler.adminRemoveEvent(channelId, eventId)
```

### 7.7 Reactions

```typescript
await handler.sendReaction(channelId, messageId, '👍')
```

---

## 8. Slash Commands

Keywords: /commands, arguments, args, paid commands, x402, command definitions

### 8.1 Define Commands

```typescript
// src/commands.ts
import type { BotCommand } from '@towns-protocol/bot'

export const commands = [
  { name: 'help', description: 'Show help' },
  { name: 'weather', description: 'Get weather for location' },
  { name: 'generate', description: 'AI content', paid: { price: '$0.20' } }  // Paid
] as const satisfies BotCommand[]
```

### 8.2 Handle Commands

```typescript
import commands from './commands'
const bot = await makeTownsBot(privateData, jwtSecret, { commands })

bot.onSlashCommand('help', async (handler, event) => {
  const list = commands.map(c => `• \`/${c.name}\` - ${c.description}`).join('\n')
  await handler.sendMessage(event.channelId, `**Commands**\n${list}`)
})

bot.onSlashCommand('weather', async (handler, { args, channelId }) => {
  // /weather San Francisco → args: ['San', 'Francisco']
  const location = args.join(' ')
  if (!location) {
    await handler.sendMessage(channelId, 'Usage: /weather <location>')
    return
  }
  // ... fetch weather
})
```

### 8.3 Paid Commands (x402)

```typescript
// Handler only runs after payment succeeds
bot.onSlashCommand('generate', async (handler, event) => {
  await handler.sendMessage(event.channelId, 'Generating your content...')
})
```

---

## 9. Interactive Components

Keywords: forms, buttons, text inputs, sendInteractionRequest, polls, surveys

### 9.1 Send Form

Keywords: interactive components, type: 'form', buttons, textInput, recipient

```typescript
await handler.sendInteractionRequest(channelId, {
  type: 'form',           // NEW: 'type' not 'case'
  id: 'my-form',
  components: [
    { id: 'name', type: 'textInput', placeholder: 'Enter name...' },
    { id: 'submit', type: 'button', label: 'Submit' },
    { id: 'cancel', type: 'button', label: 'Cancel' }
  ],
  recipient: event.userId  // Optional: private to this user
})
```

### 9.2 Component Types

| Type | Properties |
|------|------------|
| `button` | `id`, `type: 'button'`, `label` |
| `textInput` | `id`, `type: 'textInput'`, `placeholder` |

### 9.3 Handle Response

```typescript
bot.onInteractionResponse(async (handler, event) => {
  if (event.response.payload.content?.case !== 'form') return
  
  const form = event.response.payload.content.value
  if (form.id !== 'my-form') return
  
  for (const c of form.components) {
    if (c.component.case === 'button') {
      // Button clicked: c.id is the button id
      if (c.id === 'submit') {
        await handler.sendMessage(event.channelId, '✅ Submitted!')
      }
    }
    if (c.component.case === 'textInput') {
      // Text value: c.component.value.value
      const text = c.component.value.value
    }
  }
})
```

### 9.4 Public vs Private Interactions

```typescript
// PUBLIC - anyone can respond (no recipient)
await handler.sendInteractionRequest(channelId, {
  type: 'form',
  id: 'public-poll',
  components: [
    { id: 'yes', type: 'button', label: 'Yes' },
    { id: 'no', type: 'button', label: 'No' }
  ]
  // No recipient = anyone can click
})

// PRIVATE - only specific user can respond
await handler.sendInteractionRequest(channelId, {
  type: 'form',
  id: 'private-form',
  components: [
    { id: 'confirm', type: 'button', label: 'Confirm' }
  ],
  recipient: event.userId  // Only this user sees/can interact
})
```

### 9.5 Poll Example

```typescript
const polls = new Map<string, { yes: number; no: number; voters: Set<string> }>()

bot.onSlashCommand('poll', async (handler, event) => {
  const pollId = `poll-${Date.now()}`
  polls.set(pollId, { yes: 0, no: 0, voters: new Set() })
  
  await handler.sendInteractionRequest(event.channelId, {
    type: 'form',
    id: pollId,
    components: [
      { id: 'yes', type: 'button', label: 'Yes' },
      { id: 'no', type: 'button', label: 'No' }
    ]
  })
})

bot.onInteractionResponse(async (handler, event) => {
  if (event.response.payload.content?.case !== 'form') return
  const form = event.response.payload.content.value
  const poll = polls.get(form.id)
  if (!poll || poll.voters.has(event.userId)) return
  
  poll.voters.add(event.userId)
  for (const c of form.components) {
    if (c.component.case === 'button') {
      if (c.id === 'yes') poll.yes++
      if (c.id === 'no') poll.no++
    }
  }
  await handler.sendMessage(event.channelId, `Yes: ${poll.yes}, No: ${poll.no}`)
})
```

---

## 10. Transaction Requests

Keywords: user transactions, signing, ERC20, token transfers, blockchain, sendInteractionRequest

### 10.1 Request Transaction (NEW API)

Keywords: payment request, type: 'transaction', encodeFunctionData, tx object

**Security Note**: Always verify transaction success using `waitForTransactionReceipt` before granting access or updating state. See §10.5 for examples.

```typescript
import { encodeFunctionData, erc20Abi, parseUnits } from 'viem'

await handler.sendInteractionRequest(channelId, {
  type: 'transaction',    // NEW: 'type' not 'case'
  id: 'token-transfer',
  title: 'Send Tokens',
  subtitle: 'Transfer 50 USDC',
  tx: {                   // NEW: 'tx' object
    chainId: '8453',
    to: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',  // USDC
    value: '0',
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [recipient, parseUnits('50', 6)]
    }),
    signerWallet: undefined  // Optional: require specific wallet
  },
  recipient: event.userId
})
```

### 10.2 Transaction Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `'transaction'` | Yes | Interaction type |
| `id` | string | Yes | Unique ID for matching response |
| `title` | string | Yes | Heading shown to user |
| `subtitle` | string | Yes | Description text |
| `tx.chainId` | string | Yes | Chain ID (`'8453'` for Base) |
| `tx.to` | string | Yes | Contract/recipient address |
| `tx.value` | string | Yes | ETH in wei (as string) |
| `tx.data` | string | Yes | Encoded function call or `'0x'` |
| `tx.signerWallet` | string | No | Require specific wallet (omit for user choice) |
| `recipient` | string | No | Target user address (private interaction) |

### 10.3 Simple ETH Transfer

```typescript
import { parseEther } from 'viem'

await handler.sendInteractionRequest(channelId, {
  type: 'transaction',
  id: `payment-${Date.now()}`,
  title: 'Send ETH',
  subtitle: 'Send 0.01 ETH',
  tx: {
    chainId: '8453',
    to: recipientAddress,
    value: parseEther('0.01').toString(),
    data: '0x',
    signerWallet: undefined
  },
  recipient: event.userId
})
```

### 10.4 Handle Response

```typescript
bot.onInteractionResponse(async (handler, event) => {
  if (event.response.payload.content?.case !== 'transaction') return
  
  const tx = event.response.payload.content.value
  if (tx.txHash) {
    await handler.sendMessage(event.channelId, 
      `✅ Success: https://basescan.org/tx/${tx.txHash}`)
  } else if (tx.error) {
    await handler.sendMessage(event.channelId, `❌ Failed: ${tx.error}`)
  }
})
```

### 10.5 Verify Transaction Results

Keywords: payment verification, waitForTransactionReceipt, on-chain confirmation, receipt.status

When accepting payments or relying on transaction success, always verify the transaction on-chain:

```typescript
import { waitForTransactionReceipt } from 'viem/actions'

bot.onInteractionResponse(async (handler, event) => {
  if (event.response.payload.content?.case !== 'transaction') return
  const tx = event.response.payload.content.value

  if (tx.txHash) {
    // Verify transaction succeeded on-chain
    const receipt = await waitForTransactionReceipt(bot.viem, {
      hash: tx.txHash
    })

    if (receipt.status !== 'success') {
      await handler.sendMessage(event.channelId, '❌ Transaction failed on-chain')
      return
    }

    // Transaction confirmed - safe to grant access or update state
    await grantUserAccess(event.userId)
    await handler.sendMessage(event.channelId,
      `✅ Payment confirmed!\n[View transaction](https://basescan.org/tx/${tx.txHash})`
    )
  }
})
```

**Critical for payments**: Never grant access based on `txHash` alone. Always verify:
1. Transaction succeeded (`receipt.status === 'success'`)
2. For payments, optionally parse logs to verify amount and recipient

---

## 11. Signature Requests

Keywords: EIP-712, personal_sign, typed data, wallet signatures, authentication

### 11.1 Request Signature (NEW API)

```typescript
await handler.sendInteractionRequest(channelId, {
  type: 'signature',      // NEW: 'type' not 'case'
  id: 'agreement',
  title: 'Sign Agreement',
  subtitle: 'I agree to the terms',
  chainId: '8453',
  data: JSON.stringify({
    domain: { name: 'My Bot', version: '1', chainId: 8453, verifyingContract: '0x0000000000000000000000000000000000000000' },
    types: { Message: [{ name: 'content', type: 'string' }] },
    primaryType: 'Message',
    message: { content: 'I agree to the terms' }
  }),
  method: 'typed_data',   // or 'personal_sign'
  signerWallet: event.userId,
  recipient: event.userId
})
```

### 11.2 Signature Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `'signature'` | Yes | Interaction type |
| `id` | string | Yes | Unique ID for matching response |
| `chainId` | string | Yes | Chain ID |
| `data` | string | Yes | JSON stringified EIP-712 or plain message |
| `method` | string | Yes | `'typed_data'` or `'personal_sign'` |
| `signerWallet` | string | Yes | Wallet address to sign with |
| `title` | string | No | Heading shown to user |
| `subtitle` | string | No | Description text |
| `recipient` | string | No | Target user address (private interaction) |

### 11.3 Personal Sign

```typescript
await handler.sendInteractionRequest(channelId, {
  type: 'signature',
  id: 'simple-sig',
  title: 'Sign Message',
  chainId: '8453',
  data: 'Please sign to authenticate',
  method: 'personal_sign',
  signerWallet: event.userId,
  recipient: event.userId
})
```

### 11.4 Handle Response

```typescript
bot.onInteractionResponse(async (handler, event) => {
  if (event.response.payload.content?.case !== 'signature') return
  
  const sig = event.response.payload.content.value
  if (sig.signature) {
    await handler.sendMessage(event.channelId, '✅ Signed!')
  } else if (sig.error) {
    await handler.sendMessage(event.channelId, `❌ Failed: ${sig.error}`)
  }
})
```

---

## 12. Blockchain Operations

Keywords: viem, readContract, execute, on-chain, smart contracts, ERC20, balances, tips

### 12.1 Read Contract

```typescript
import { readContract } from 'viem/actions'

const balance = await readContract(bot.viem, {
  address: tokenAddress,
  abi: erc20Abi,
  functionName: 'balanceOf',
  args: [userAddress]
})
```

### 12.2 Write Contract (execute)

Primary method for all on-chain operations:

```typescript
import { execute } from 'viem/experimental/erc7821'
import { waitForTransactionReceipt } from 'viem'

const hash = await execute(bot.viem, {
  address: bot.appAddress,
  account: bot.viem.account,
  calls: [{
    to: targetAddress,
    abi: contractAbi,
    functionName: 'someFunction',
    args: [arg1, arg2],
    value: parseEther('0.01')
  }]
})

await waitForTransactionReceipt(bot.viem, { hash })
```

### 12.3 writeContract (SimpleAccount Only)

Alternative for bot's own SimpleAccount contract:

```typescript
import { writeContract } from 'viem/actions'
import simpleAppAbi from '@towns-protocol/bot/simpleAppAbi'

const hash = await writeContract(bot.viem, {
  address: bot.appAddress,
  abi: simpleAppAbi,
  functionName: 'sendCurrency',
  args: [recipient, zeroAddress, parseEther('0.01')]
})
```

**Note:** Use `execute()` for external contracts. `writeContract` with `simpleAppAbi` is only for the bot's own SimpleAccount.

### 12.4 Batch Transactions (Atomic)

```typescript
const hash = await execute(bot.viem, {
  address: bot.appAddress,
  account: bot.viem.account,
  calls: [
    { to: token, abi: erc20Abi, functionName: 'approve', args: [spender, amount] },
    { to: dex, abi: dexAbi, functionName: 'swap', args: [...] }
  ]
})
```

### 12.5 Send Tips

Requires funded gas wallet (`bot.viem.account.address`):

```typescript
await handler.sendTip({
  userId: recipientUserId,
  amount: parseEther('0.001'),
  messageId: messageId,
  channelId: channelId
})
```

### 12.6 Get User's Smart Account

```typescript
import { getSmartAccountFromUserId } from '@towns-protocol/bot'

const wallet = await getSmartAccountFromUserId(bot, { userId: event.userId })
// Returns address or null
```

---

## 13. Permissions & Moderation

Keywords: Permission, ban, unban, admin, hasAdminPermission, checkPermission, moderation

### 13.1 Permission Enum

```typescript
import { Permission } from '@towns-protocol/web3'

Permission.Read
Permission.Write
Permission.Redact
Permission.React
Permission.Invite
Permission.JoinSpace
Permission.ModifyBanning
Permission.PinMessage
Permission.AddRemoveChannels
Permission.ModifySpaceSettings
```

### 13.2 Check Permissions

```typescript
const isAdmin = await handler.hasAdminPermission(userId, spaceId)
const canRedact = await handler.checkPermission(channelId, userId, Permission.Redact)
```

### 13.3 Ban/Unban

Requires `ModifyBanning` permission and funded gas wallet (`bot.viem.account.address`):

```typescript
await handler.ban(userId, spaceId)
await handler.unban(userId, spaceId)
```

---

## 14. Roles & Token Gating

Keywords: createRole, Rules API, token-gated, ERC20, ERC721, NFT gating, access control

Requires bot admin permissions and funded gas wallet (`bot.viem.account.address`).

### 14.1 Create Role

```typescript
import { Permission } from '@towns-protocol/web3'

const { roleId } = await bot.createRole(spaceId, {
  name: 'Moderator',
  permissions: [Permission.Read, Permission.Write, Permission.ModifyBanning],
  users: ['0x...']  // Optional
})
```

### 14.2 Token-Gated Roles (Rules API)

```typescript
import { Permission, Rules } from '@towns-protocol/web3'

const townsHolderRule = Rules.checkErc20({
  chainId: 8453n,
  contractAddress: '0x00000000A22C618fd6b4D7E9A335C4B96B189a38',
  threshold: 1n
})

const role = await bot.createRole(spaceId, {
  name: 'Towns Holder',
  permissions: [Permission.Read, Permission.Write],
  rule: townsHolderRule
})

await bot.addRoleToChannel(channelId, role.roleId)
```

### 14.3 Rule Types

```typescript
Rules.checkErc721({ chainId, contractAddress, threshold })
Rules.checkErc20({ chainId, contractAddress, threshold })
Rules.checkErc1155({ chainId, contractAddress, tokenId, threshold })
Rules.checkEthBalance({ threshold })
Rules.checkIsEntitled({ chainId, contractAddress, params? })

// Combine
Rules.and(ruleA, ruleB)
Rules.or(ruleA, ruleB)
Rules.every(ruleA, ruleB, ruleC)
Rules.some(ruleA, ruleB, ruleC)
```

### 14.4 Manage Roles

```typescript
const roles = await bot.getAllRoles(spaceId)
const role = await bot.getRole(spaceId, roleId)
await bot.updateRole(spaceId, roleId, { name: 'New Name', permissions: [...] })
await bot.deleteRole(spaceId, roleId)
await bot.addRoleToChannel(channelId, roleId)
```

---

## 15. Miniapps

Keywords: iframe, miniapp SDK, Farcaster SDK, HTML, embedded app, wallet provider, fc:miniapp

### 15.1 Required Meta Tag

Every miniapp MUST have this in `<head>`:

```html
<meta name="fc:miniapp" content='{
  "version": "1",
  "imageUrl": "https://your-domain.com/preview.png",
  "button": {
    "title": "Open App",
    "action": {
      "type": "launch_miniapp",
      "name": "My Miniapp",
      "url": "https://your-domain.com/miniapp.html",
      "splashImageUrl": "https://your-domain.com/splash.png",
      "splashBackgroundColor": "#667eea"
    }
  }
}' />
```

**Requirements:**
- `version`: Always `"1"`
- `button.title`: ~25 chars max, NO emojis
- HTTPS required in production

### 15.2 SDK Initialization

Keywords: SDK initialization, timeout, ready(), context, @farcaster/miniapp-sdk, version 0.2.1

Use version 0.2.1 exactly (0.2.3 returns 404):

```javascript
import { sdk } from 'https://esm.sh/@farcaster/miniapp-sdk@0.2.1'

async function initTownsSDK() {
  try {
    // Step 1: Call ready() with timeout (SKIP isInMiniApp check!)
    try {
      await Promise.race([
        sdk.actions.ready(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
      ])
    } catch (e) {
      console.warn('ready() timed out, continuing...')
    }
    
    // Step 2: Get context
    const context = await Promise.race([
      sdk.context,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
    ])
    
    // Step 3: Validate
    if (!context?.towns?.user?.userId) {
      throw new Error('Missing Towns user data')
    }
    
    return context
  } catch (error) {
    console.error('SDK init failed:', error)
    throw error
  }
}
```

### 15.3 Context Structure

```javascript
{
  user: { displayName, pfpUrl, username },
  towns: {
    user: {
      userId: "0x...",           // Primary identifier
      address: "0x...",          // Primary wallet
      linkedWallets: [{ address, type, primary }]
    },
    env: "omega",
    spaceId, spaceName,
    channelId, channelName,
    messageId
  },
  client: { platformType, added, safeAreaInsets }
}
```

### 15.4 Access Context Data

```javascript
const userId = context.towns.user.userId
const channelId = context.towns.channelId
const spaceId = context.towns.spaceId
const walletAddress = context.towns.user.address
const allWallets = context.towns.user.linkedWallets
```

### 15.5 SDK Actions

```javascript
await sdk.actions.close()
await sdk.actions.openUrl('https://example.com')
await sdk.actions.composeCast({ text: 'Hello!', embeds: [], close: false })
```

### 15.6 Wallet Operations

```javascript
const provider = await sdk.wallet.getEthereumProvider()
const accounts = await provider.request({ method: 'eth_accounts' })
const txHash = await provider.request({
  method: 'eth_sendTransaction',
  params: [{ from: accounts[0], to: '0x...', value: '0x38D7EA4C68000' }]
})
```

### 15.7 Multi-Wallet Provider (NEW SDK)

Latest SDK returns structured provider object:

```javascript
const { 
  provider,              // Main provider
  defaultAddress,        // Default wallet address
  privyAddress,          // Privy wallet (if exists)
  getProviderForAddress  // Get provider for specific address
} = await sdk.wallet.getEthereumProvider()

// Send from ANY linked wallet - SDK routes automatically!
await provider.request({
  method: 'eth_sendTransaction',
  params: [{
    from: anyLinkedWalletAddress,  // SDK handles routing
    to: '0x...',
    value: '0x...'
  }]
})

// Get provider for specific address
const specificProvider = getProviderForAddress('0x...')
```

**Benefits:**
- No manual provider management
- Automatic address-based routing
- Works with Smart Accounts and EOAs
- Events proxied across all providers

### 15.8 Miniapp API Security

When miniapps submit data to your bot's API endpoints, always validate server-side:

**Validate All Inputs**
```typescript
// Example: Secure score submission endpoint
app.post('/api/score', async (c) => {
  const { userId, score, time } = await c.req.json()

  // Type validation
  if (!userId || typeof score !== 'number' || typeof time !== 'number') {
    return c.json({ error: 'Invalid input' }, 400)
  }

  // Range validation
  if (score < 0 || score > 1000) {
    return c.json({ error: 'Invalid score range' }, 400)
  }

  if (time < 0 || time > 3600) {
    return c.json({ error: 'Invalid time range' }, 400)
  }

  // Store in database (not in-memory)
  await db.saveScore(userId, score, time)
  return c.json({ success: true })
})
```

**Critical Reminders**
- Never trust client-submitted data (easily manipulated in browser)
- Use server-side storage (database), not localStorage (per-device, insecure)
- Implement rate limiting to prevent API abuse
- Consider authentication tokens for sensitive operations
- Validate data types, ranges, and formats server-side

See §19.4 for additional production considerations.

---

## 16. Linked Wallets

Keywords: smart accounts, EOA, linkedWallets, getSmartAccountFromUserId, multi-wallet

### 16.1 Wallet Types

| Type | Description |
|------|-------------|
| `smartAccount` | ERC-4337 Smart Account |
| `eoa` | Externally Owned Account |

### 16.2 Access in Miniapp

```javascript
const userId = context.towns.user.userId        // Primary identifier
const primaryWallet = context.towns.user.address
const linkedWallets = context.towns.user.linkedWallets
// [{ address, type: 'smartAccount'|'eoa', primary: boolean }]
```

**Note**: userId may not be in linkedWallets - add manually if missing:

```javascript
function getAllUserWallets(context) {
  let wallets = context.towns.user.linkedWallets || []
  const userId = context.towns.user.userId?.toLowerCase()
  
  const userIdInWallets = wallets.some(w => w.address.toLowerCase() === userId)
  if (userId && !userIdInWallets) {
    wallets = [{ address: userId, type: 'smartAccount', primary: false }, ...wallets]
  }
  return wallets
}
```

### 16.3 Get User Wallet (Bot Side)

```typescript
import { getSmartAccountFromUserId } from '@towns-protocol/bot'
const wallet = await getSmartAccountFromUserId(bot, { userId: event.userId })
```

---

## 17. Snapshot Data

Keywords: cache, getChannelInception, getUserMemberships, getSpaceMemberships, channel settings

**Note:** Snapshot data is cached and may not reflect real-time state.

### 17.1 Get Channel Info

```typescript
const channelData = await bot.snapshot.getChannelInception(streamId)
console.log('Channel name:', channelData.settings.name)
```

### 17.2 Get User Memberships

```typescript
const memberships = await bot.snapshot.getUserMemberships(userId)
// Returns: List of spaces the user is a member of
```

### 17.3 Get Space Memberships

```typescript
const members = await bot.snapshot.getSpaceMemberships(spaceId)
// Returns: List of all users in the space
```

---

## 18. External Integrations

Keywords: webhooks, timers, Hono, custom routes, scheduled tasks, external APIs

### 18.1 Custom Routes

`bot.start()` returns a Hono app:

```typescript
const app = bot.start()

app.get('/health', (c) => c.json({ status: 'ok' }))

app.post('/webhook/github', async (c) => {
  const payload = await c.req.json()
  if (githubChannelId) {
    await bot.sendMessage(githubChannelId, `📦 GitHub: ${payload.action}`)
  }
  return c.json({ received: true })
})

export default app
```

### 18.2 Scheduled Tasks

```typescript
let dailyChannelId: string | null = null

bot.onSlashCommand('enable-daily', async (handler, event) => {
  dailyChannelId = event.channelId
  await handler.sendMessage(event.channelId, '✅ Daily enabled')
})

function scheduleDailyMessage() {
  const now = new Date()
  const next9AM = new Date(now)
  next9AM.setHours(9, 0, 0, 0)
  if (now >= next9AM) next9AM.setDate(next9AM.getDate() + 1)
  
  setTimeout(async () => {
    if (dailyChannelId) await bot.sendMessage(dailyChannelId, '☀️ Good morning!')
    scheduleDailyMessage()
  }, next9AM.getTime() - now.getTime())
}

scheduleDailyMessage()
```

### 18.3 Bot Methods (Outside Handlers)

All handler methods available on bot directly:

```typescript
bot.sendMessage(channelId, msg, opts?)
bot.editMessage(channelId, eventId, text)
bot.sendReaction(channelId, messageId, emoji)
bot.removeEvent(channelId, eventId)
bot.adminRemoveEvent(channelId, eventId)
bot.pinMessage(channelId, eventId, streamEvent)
bot.unpinMessage(channelId, eventId)
bot.createChannel(spaceId, opts)
bot.sendTip(opts)
bot.hasAdminPermission(userId, spaceId)
bot.checkPermission(channelId, userId, permission)
bot.ban(userId, spaceId)
bot.unban(userId, spaceId)
```

---

## 19. Troubleshooting

Keywords: errors, debugging, common mistakes, gotchas

### 19.1 Common Errors

| Error | Solution |
|-------|----------|
| `insufficient funds for gas` | Fund `bot.viem.account.address` with Base ETH |
| `execution reverted` | Check function args and contract state |
| `webhook signature invalid` | Verify JWT_SECRET matches Developer Portal |
| `command not found` | Add to commands array and restart |

### 19.2 Critical Gotchas

1. **User IDs are addresses** - Always `0x...`
2. **Mentions need BOTH** - `<@userId>` in text AND mentions array
3. **Slash commands exclusive** - Don't trigger onMessage
4. **Fund gas wallet** - `bot.viem.account.address` MUST have Base ETH (treasury optional)
5. **Message forwarding** - Some handlers need "All Messages" mode
6. **Custom RPC recommended** - Public RPC has rate limits
7. **Snapshot data is cached** - May not be real-time

### 19.3 Debug Balances

```typescript
import { formatEther } from 'viem'
console.log('Gas:', formatEther(await bot.viem.getBalance({ address: bot.viem.account.address })))
console.log('Treasury:', formatEther(await bot.viem.getBalance({ address: bot.appAddress })))
```

### 19.4 Production Considerations

When deploying to production, consider these additional requirements:

**Data Persistence**
- In-memory storage (Map, Set) is lost on bot restart
- For production, use persistent storage:
  - SQLite: `import Database from 'bun:sqlite'`
  - PostgreSQL/MySQL for multi-instance deployments
  - Redis for shared state across bot instances

**Input Validation**
- Always validate user inputs before processing
- Check numeric ranges (amounts, quantities, dates)
- Sanitize text inputs to prevent injection attacks
- Validate addresses are valid Ethereum addresses

**Rate Limiting**
- Protect API endpoints from abuse
- Limit command frequency per user
- Use rate limiting middleware or track request counts

**Transaction Verification**
- Never trust `txHash` alone for payments (see §10.5)
- Always verify transaction succeeded on-chain
- Optionally verify payment amount and recipient in logs

**Error Handling**
- Catch and log errors for debugging
- Provide user-friendly error messages
- Implement retry logic for transient failures

**Monitoring**
- Log important events (payments, errors, security events)
- Monitor bot health and uptime
- Track command usage and performance

---

## Appendix B: Full Templates

Keywords: complete examples, full bot code, working templates, copy-paste

### B.1 Minimal Bot

```typescript
import { makeTownsBot } from '@towns-protocol/bot'

const commands = [
  { name: 'ping', description: 'Check if alive' }
] as const

const bot = await makeTownsBot(
  process.env.APP_PRIVATE_DATA!,
  process.env.JWT_SECRET!,
  { commands }
)

bot.onSlashCommand('ping', async (handler, event) => {
  await handler.sendMessage(event.channelId, 'Pong! 🏓')
})

export default bot.start()
```

### B.2 Interactive Poll Bot

```typescript
import { makeTownsBot } from '@towns-protocol/bot'

const commands = [{ name: 'poll', description: 'Create poll' }] as const
const bot = await makeTownsBot(process.env.APP_PRIVATE_DATA!, process.env.JWT_SECRET!, { commands })

const polls = new Map<string, { yes: number; no: number; voters: Set<string> }>()

bot.onSlashCommand('poll', async (handler, event) => {
  const pollId = `poll-${Date.now()}`
  polls.set(pollId, { yes: 0, no: 0, voters: new Set() })
  
  await handler.sendInteractionRequest(event.channelId, {
    type: 'form',
    id: pollId,
    components: [
      { id: 'yes', type: 'button', label: 'Yes' },
      { id: 'no', type: 'button', label: 'No' }
    ]
  })
})

bot.onInteractionResponse(async (handler, event) => {
  if (event.response.payload.content?.case !== 'form') return
  const form = event.response.payload.content.value
  const poll = polls.get(form.id)
  if (!poll || poll.voters.has(event.userId)) return
  
  poll.voters.add(event.userId)
  for (const c of form.components) {
    if (c.component.case === 'button') {
      if (c.id === 'yes') poll.yes++
      if (c.id === 'no') poll.no++
    }
  }
  await handler.sendMessage(event.channelId, `Yes: ${poll.yes}, No: ${poll.no}`)
})

export default bot.start()
```

### B.3 Token Balance Bot

```typescript
import { makeTownsBot, getSmartAccountFromUserId } from '@towns-protocol/bot'
import { readContract } from 'viem/actions'
import { formatUnits, erc20Abi } from 'viem'

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const commands = [{ name: 'balance', description: 'Check USDC balance' }] as const

const bot = await makeTownsBot(
  process.env.APP_PRIVATE_DATA!,
  process.env.JWT_SECRET!,
  { commands, baseRpcUrl: process.env.BASE_RPC_URL }
)

bot.onSlashCommand('balance', async (handler, event) => {
  const targetUserId = event.mentions[0]?.userId || event.userId
  const wallet = await getSmartAccountFromUserId(bot, { userId: targetUserId })
  
  if (!wallet) {
    await handler.sendMessage(event.channelId, '❌ No smart account found')
    return
  }
  
  const balance = await readContract(bot.viem, {
    address: USDC,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [wallet]
  })
  
  await handler.sendMessage(event.channelId, `💰 Balance: ${formatUnits(balance, 6)} USDC`)
})

export default bot.start()
```

### B.4 Miniapp HTML Template

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Miniapp</title>
  <meta name="fc:miniapp" content='{"version":"1","imageUrl":"https://your-domain.com/preview.png","button":{"title":"Open App","action":{"type":"launch_miniapp","name":"My Miniapp","url":"https://your-domain.com/app.html","splashBackgroundColor":"#0b0618"}}}' />
  <style>
    body { font-family: system-ui; padding: 20px; margin: 0; background: #1a1a2e; color: #fff; }
    #loading { text-align: center; padding: 40px; }
    #app { display: none; }
    .card { background: #16213e; padding: 20px; border-radius: 12px; margin-bottom: 16px; }
    .wallet { font-family: monospace; background: #0f3460; padding: 8px; border-radius: 4px; word-break: break-all; }
    button { background: #e94560; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; }
  </style>
</head>
<body>
  <div id="loading">⏳ Loading...</div>
  <div id="app">
    <div class="card">
      <h2>Welcome, <span id="username">User</span>!</h2>
      <p>User ID: <span class="wallet" id="user-id"></span></p>
      <p>Primary Wallet: <span class="wallet" id="wallet"></span></p>
    </div>
    <button onclick="closeApp()">Close</button>
  </div>

  <script type="module">
    import { sdk } from 'https://esm.sh/@farcaster/miniapp-sdk@0.2.1'

    async function init() {
      try {
        // Initialize SDK with timeout protection
        try {
          await Promise.race([
            sdk.actions.ready(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
          ])
        } catch (e) {
          console.warn('ready() timed out, continuing...')
        }

        // Get Towns context
        const context = await Promise.race([
          sdk.context,
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
        ])

        if (!context?.towns?.user?.userId) {
          throw new Error('Missing Towns user data')
        }

        // Display user data
        document.getElementById('username').textContent = context.user?.displayName || 'User'
        document.getElementById('user-id').textContent = context.towns.user.userId
        document.getElementById('wallet').textContent = context.towns.user.address
        document.getElementById('loading').style.display = 'none'
        document.getElementById('app').style.display = 'block'
      } catch (error) {
        console.error('Init failed:', error)
        document.getElementById('loading').textContent = '❌ Failed to load'
      }
    }

    window.closeApp = () => sdk.actions.close().catch(() => {})
    init()
  </script>
</body>
</html>
```

---

## Official Resources

- **Documentation:** https://docs.towns.com/build/bots/
- **Developer Portal:** https://app.towns.com/developer
- **SDK:** https://www.npmjs.com/package/@towns-protocol/bot
- **LLMs.txt:** https://docs.towns.com/llms.txt
- **Base Explorer:** https://basescan.org
- **Chain ID:** 8453 (Base Mainnet)
