import { getSmartAccountFromUserId, makeTownsBot } from '@towns-protocol/bot'
import { hexToBytes, isAddress } from 'viem'
import commands from './commands'
import { buildPaymentInteractionFromMessage, shouldHandlePaymentMessage } from './payments'

const bot = await makeTownsBot(process.env.APP_PRIVATE_DATA!, process.env.JWT_SECRET!, {
    commands,
})

bot.onSlashCommand('help', async (handler, { channelId }) => {
    await handler.sendMessage(
        channelId,
        '**Available Commands:**\n\n' +
            '• `/help` - Show this help message\n' +
            '• `/time` - Get the current time\n\n' +
            '**Message Triggers:**\n\n' +
            "• Mention me - I'll respond\n" +
            "• React with 👋 - I'll wave back" +
            '• Say "hello" - I\'ll greet you back\n' +
            '• Say "ping" - I\'ll show latency\n' +
            '• Say "react" - I\'ll add a reaction\n',
    )
})

bot.onSlashCommand('time', async (handler, { channelId }) => {
    const currentTime = new Date().toLocaleString()
    await handler.sendMessage(channelId, `Current time: ${currentTime} ⏰`)
})

bot.onMessage(async (handler, event) => {
    const { channelId, message } = event

    if (!shouldHandlePaymentMessage(event)) return

    // Requirements: resolve recipient from event.mentions[0].userId (do not ask for wallet addresses)
    // In channels, users may mention the bot AND the recipient; ensure we pick the recipient (not the bot).
    const recipientUserId = event.mentions
        ?.map((m) => m.userId)
        .find((id) => isAddress(id) && id.toLowerCase() !== bot.botId.toLowerCase()) as `0x${string}` | undefined

    if (!recipientUserId) {
        await handler.sendMessage(
            channelId,
            'To send funds, mention a recipient (e.g. `send 0.0001 ETH to @Cris`).',
        )
        return
    }

    const recipientSmartAccount = await getSmartAccountFromUserId(bot, { userId: recipientUserId })
    if (!recipientSmartAccount) {
        await handler.sendMessage(channelId, 'I could not resolve that user’s Towns smart account on Base.')
        return
    }

    const interaction = await buildPaymentInteractionFromMessage(bot, {
        message,
        senderUserId: event.userId,
        eventId: event.eventId,
        recipient: {
            userId: recipientUserId,
            displayName: event.mentions?.find((m) => m.userId.toLowerCase() === recipientUserId.toLowerCase())?.displayName,
            smartAccount: recipientSmartAccount,
        },
    })

    if (!interaction.ok) {
        await handler.sendMessage(channelId, interaction.error)
        return
    }

    // Requirements: user-signed interaction request, signer is the message author (event.userId)
    await handler.sendInteractionRequest(channelId, interaction.request, hexToBytes(event.userId))
})

bot.onReaction(async (handler, { reaction, channelId }) => {
    if (reaction === '👋') {
        await handler.sendMessage(channelId, 'I saw your wave! 👋')
    }
})

const app = bot.start()
// Render / uptime healthcheck endpoint
app.get('/health', (c) => c.json({ status: 'ok' }))
export default app
