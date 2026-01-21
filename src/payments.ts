import { encodeFunctionData, isAddress, parseEther, parseUnits } from 'viem'
import { readContract } from 'viem/actions'

type BotWithViem = {
    // Towns bot exposes a viem client; we only need it for readContract.
    // Using a structural type keeps this file decoupled from package-exported types.
    viem: Parameters<typeof readContract>[0]
}

const BASE_CHAIN_ID = '8453' as const
const TOKEN_LIST_URL = 'https://base.api.0x.org/swap/v1/tokens' as const
const TOKEN_LIST_CACHE_TTL_MS = 10 * 60 * 1000

const erc20Abi = [
    {
        type: 'function',
        name: 'decimals',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint8' }],
    },
    {
        type: 'function',
        name: 'symbol',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'string' }],
    },
    {
        type: 'function',
        name: 'transfer',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ name: '', type: 'bool' }],
    },
] as const

type MentionedRecipient = {
    userId: string
    displayName?: string
    smartAccount: `0x${string}`
}

type BuildPaymentInteractionInput = {
    message: string
    senderUserId: string
    eventId: string
    recipient: MentionedRecipient
}

type BuildPaymentInteractionResult =
    | {
          ok: true
          request: {
              case: 'transaction'
              value: {
                  id: string
                  title: string
                  content: {
                      case: 'evm'
                      value: {
                          chainId: typeof BASE_CHAIN_ID
                          to: `0x${string}`
                          value: string
                          data: `0x${string}`
                          signerWallet: undefined
                      }
                  }
              }
          }
      }
    | { ok: false; error: string }

/**
 * Trigger rules:
 * - DM/GDM: always allow
 * - Channels: only when bot is mentioned OR message includes bot-name keyword (env BOT_NAME).
 */
export function shouldHandlePaymentMessage(event: { isDm: boolean; isMentioned: boolean; message: string }) {
    if (event.isDm) return true
    if (event.isMentioned) return true

    const botName = (process.env.BOT_NAME || 'speedrun').trim().toLowerCase()
    const msg = event.message.toLowerCase()

    // "bot name keyword" requirement: allow a lightweight keyword trigger for channels.
    if (botName && msg.includes(botName)) return true

    return false
}

export async function buildPaymentInteractionFromMessage(
    bot: BotWithViem,
    input: BuildPaymentInteractionInput,
): Promise<BuildPaymentInteractionResult> {
    const parsed = parsePaymentRequest(input.message)
    if (!parsed.ok) return parsed

    const { amountRaw, tokenRaw, verb } = parsed.value

    const requestId = `payment-${input.eventId}`
    const recipient = input.recipient

    // ETH path
    if (isEthToken(tokenRaw)) {
        const valueWei = safeParseEther(amountRaw)
        if (!valueWei.ok) return valueWei

        return {
            ok: true,
            request: {
                case: 'transaction',
                value: {
                    id: requestId,
                    title: `${capitalize(verb)} ${amountRaw} ETH to ${recipient.displayName ?? 'recipient'}`,
                    content: {
                        case: 'evm',
                        value: {
                            chainId: BASE_CHAIN_ID,
                            to: recipient.smartAccount,
                            value: valueWei.value.toString(),
                            data: '0x',
                            signerWallet: undefined,
                        },
                    },
                },
            },
        }
    }

    // ERC20 path
    const token = await resolveErc20OnBase(bot, tokenRaw)
    if (!token.ok) return token

    const amountUnits = safeParseUnits(amountRaw, token.value.decimals)
    if (!amountUnits.ok) return amountUnits

    const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [recipient.smartAccount, amountUnits.value],
    })

    return {
        ok: true,
        request: {
            case: 'transaction',
            value: {
                id: requestId,
                title: `${capitalize(verb)} ${amountRaw} ${token.value.symbol ?? tokenRaw.toUpperCase()} to ${
                    recipient.displayName ?? 'recipient'
                }`,
                content: {
                    case: 'evm',
                    value: {
                        chainId: BASE_CHAIN_ID,
                        to: token.value.address,
                        value: '0',
                        data,
                        signerWallet: undefined,
                    },
                },
            },
        },
    }
}

type ParsePaymentOk = { ok: true; value: { verb: 'send' | 'pay'; amountRaw: string; tokenRaw: string } }
type ParsePaymentErr = { ok: false; error: string }

function parsePaymentRequest(message: string): ParsePaymentOk | ParsePaymentErr {
    // Supported:
    // - send 0.0001 ETH to @Cris
    // - pay 5 USDC to @Cris
    // - send 10 TOWNS to @Cris
    // - send 123 0xTokenAddress... to @Cris
    //
    // Recipient is resolved from event.mentions[0] (not parsed here).
    const re =
        /\b(?<verb>send|pay)\b\s+(?:me\s+)?(?<amount>\d+(?:\.\d+)?|\.\d+)\s+(?<token>0x[a-fA-F0-9]{40}|[A-Za-z][A-Za-z0-9]{0,31})\b/i

    const m = message.match(re)
    if (!m?.groups) {
        return {
            ok: false,
            error:
                'I can help with sends like `send 0.0001 ETH to @Cris` or `pay 5 USDC to @Cris` (mention the recipient).',
        }
    }

    const verb = m.groups.verb.toLowerCase() as 'send' | 'pay'
    const amountRaw = normalizeAmount(m.groups.amount)
    const tokenRaw = m.groups.token

    if (!isFiniteNumberString(amountRaw) || Number(amountRaw) <= 0) {
        return { ok: false, error: `Invalid amount: \`${m.groups.amount}\`.` }
    }

    return { ok: true, value: { verb, amountRaw, tokenRaw } }
}

function isEthToken(tokenRaw: string) {
    const t = tokenRaw.trim().toUpperCase()
    return t === 'ETH'
}

function normalizeAmount(a: string) {
    const t = a.trim()
    return t.startsWith('.') ? `0${t}` : t
}

function isFiniteNumberString(s: string) {
    const n = Number(s)
    return Number.isFinite(n)
}

function safeParseEther(amount: string): { ok: true; value: bigint } | { ok: false; error: string } {
    try {
        return { ok: true, value: parseEther(amount) }
    } catch {
        return { ok: false, error: `Could not parse ETH amount: \`${amount}\`.` }
    }
}

function safeParseUnits(amount: string, decimals: number): { ok: true; value: bigint } | { ok: false; error: string } {
    try {
        return { ok: true, value: parseUnits(amount, decimals) }
    } catch {
        return { ok: false, error: `Could not parse token amount: \`${amount}\` (decimals=${decimals}).` }
    }
}

type ResolvedErc20 =
    | { ok: true; value: { address: `0x${string}`; decimals: number; symbol?: string } }
    | { ok: false; error: string }

async function resolveErc20OnBase(bot: BotWithViem, tokenInput: string): Promise<ResolvedErc20> {
    const trimmed = tokenInput.trim()

    if (isAddress(trimmed)) {
        const address = trimmed as `0x${string}`
        const decimals = await readContract(bot.viem, { address, abi: erc20Abi, functionName: 'decimals' })
        let symbol: string | undefined
        try {
            symbol = await readContract(bot.viem, { address, abi: erc20Abi, functionName: 'symbol' })
        } catch {
            // optional
        }
        return { ok: true, value: { address, decimals: Number(decimals), symbol } }
    }

    const symbol = trimmed.toUpperCase()
    const tokenList = await get0xBaseTokenList()
    if (!tokenList.ok) return tokenList

    const info = tokenList.value.get(symbol)
    if (!info) {
        return {
            ok: false,
            error:
                `I couldn't find token symbol \`${symbol}\` on Base via the 0x token list. Try using the token address (0x...).`,
        }
    }

    return { ok: true, value: { address: info.address, decimals: info.decimals, symbol: info.symbol } }
}

type TokenListResult =
    | { ok: true; value: Map<string, { address: `0x${string}`; decimals: number; symbol: string }> }
    | { ok: false; error: string }

let tokenListCache:
    | { fetchedAt: number; map: Map<string, { address: `0x${string}`; decimals: number; symbol: string }> }
    | undefined

async function get0xBaseTokenList(): Promise<TokenListResult> {
    const now = Date.now()
    if (tokenListCache && now - tokenListCache.fetchedAt < TOKEN_LIST_CACHE_TTL_MS) {
        return { ok: true, value: tokenListCache.map }
    }

    try {
        const res = await fetch(TOKEN_LIST_URL, { headers: { accept: 'application/json' } })
        if (!res.ok) return { ok: false, error: `Token list fetch failed (${res.status}).` }

        const json = (await res.json()) as unknown
        const tokens = extract0xTokenArray(json)
        if (!tokens) return { ok: false, error: 'Token list fetch succeeded but response format was unexpected.' }

        const map = new Map<string, { address: `0x${string}`; decimals: number; symbol: string }>()
        for (const t of tokens) {
            const symbol = String(t.symbol ?? '').toUpperCase()
            const address = String(t.address ?? '')
            const decimals = Number(t.decimals)
            if (!symbol || !isAddress(address) || !Number.isFinite(decimals)) continue
            map.set(symbol, { symbol, address: address as `0x${string}`, decimals })
        }

        tokenListCache = { fetchedAt: now, map }
        return { ok: true, value: map }
    } catch (e) {
        return { ok: false, error: `Token list fetch error: ${(e as Error)?.message ?? String(e)}` }
    }
}

function extract0xTokenArray(json: unknown): Array<{ symbol?: unknown; address?: unknown; decimals?: unknown }> | null {
    if (!json || typeof json !== 'object') return null
    const anyJson = json as Record<string, unknown>

    // 0x APIs typically use `records`, but we also support `tokens` to be robust.
    const records = anyJson.records
    if (Array.isArray(records)) return records as Array<{ symbol?: unknown; address?: unknown; decimals?: unknown }>

    const tokens = anyJson.tokens
    if (Array.isArray(tokens)) return tokens as Array<{ symbol?: unknown; address?: unknown; decimals?: unknown }>

    return null
}

function capitalize(s: string) {
    return s.length ? s[0].toUpperCase() + s.slice(1) : s
}

