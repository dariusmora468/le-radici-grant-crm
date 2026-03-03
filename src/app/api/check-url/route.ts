import { validateAuth } from '@/lib/api-auth'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 15

export async function POST(req: NextRequest) {
  const authError = await validateAuth(req)
  if (authError) return authError

  const { url } = await req.json()
  if (!url || typeof url !== 'string') {
    return NextResponse.json({ valid: false, reason: 'No URL provided' })
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GrantFlowBot/1.0)' },
    })
    clearTimeout(timeout)

    const valid = res.status >= 200 && res.status < 400
    return NextResponse.json({ valid, status: res.status, url })
  } catch (err: any) {
    const reason = err?.name === 'AbortError' ? 'timeout' : 'unreachable'
    return NextResponse.json({ valid: false, reason, url })
  }
}
