import { createServer } from 'node:http'
import app from './index'

const port = Number(process.env.PORT || 3000)

// Bun runtime (local dev) support
const bun = (globalThis as unknown as { Bun?: { serve: (opts: { port: number; fetch: typeof app.fetch }) => unknown } }).Bun
if (bun?.serve) {
    bun.serve({ port, fetch: app.fetch })
    // eslint-disable-next-line no-console
    console.log(`Listening on http://localhost:${port}`)
} else {
    // Node runtime (Render) support
    const server = createServer(async (req, res) => {
        try {
            const origin = `http://${req.headers.host || `localhost:${port}`}`
            const url = new URL(req.url || '/', origin)

            const headers = new Headers()
            for (const [key, value] of Object.entries(req.headers)) {
                if (typeof value === 'undefined') continue
                if (Array.isArray(value)) {
                    for (const v of value) headers.append(key, v)
                } else {
                    headers.set(key, value)
                }
            }

            const method = req.method || 'GET'
            const hasBody = method !== 'GET' && method !== 'HEAD'

            const request = new Request(url, {
                method,
                headers,
                body: hasBody ? (req as unknown as BodyInit) : undefined,
                // Required by Node when body is a stream
                duplex: 'half',
            } as RequestInit)

            const response = await app.fetch(request)

            res.statusCode = response.status

            // Handle Set-Cookie correctly if present
            const getSetCookie = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie
            if (getSetCookie) {
                const cookies = getSetCookie()
                if (cookies.length) res.setHeader('set-cookie', cookies)
            }

            response.headers.forEach((value, key) => {
                if (key.toLowerCase() === 'set-cookie') return
                res.setHeader(key, value)
            })

            if (method === 'HEAD') {
                res.end()
                return
            }

            const body = Buffer.from(await response.arrayBuffer())
            res.end(body)
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Server error:', err)
            res.statusCode = 500
            res.end('Internal Server Error')
        }
    })

    server.listen(port, () => {
        // eslint-disable-next-line no-console
        console.log(`Listening on http://0.0.0.0:${port}`)
    })
}

