import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const checks: Record<string, any> = {
    timestamp: new Date().toISOString(),
    status: 'ok',
    checks: {},
  }

  // Check 1: Supabase connection
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) {
      checks.checks.supabase = { status: 'fail', error: 'Missing SUPABASE_URL or ANON_KEY env vars' }
    } else {
      const sb = createClient(url, key)
      const { error } = await sb.from('projects').select('id').limit(1)
      if (error) {
        checks.checks.supabase = { status: 'fail', error: error.message }
      } else {
        checks.checks.supabase = { status: 'ok' }
      }
    }
  } catch (err: any) {
    checks.checks.supabase = { status: 'fail', error: err.message }
  }

  // Check 2: Anthropic API key exists
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    checks.checks.anthropic_key = { status: 'fail', error: 'ANTHROPIC_API_KEY not set in environment variables' }
  } else {
    checks.checks.anthropic_key = {
      status: 'ok',
      key_prefix: apiKey.substring(0, 10) + '...',
      key_length: apiKey.length,
    }
  }

  // Check 3: Anthropic API reachable (lightweight call)
  if (apiKey) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Reply with just the word "ok"' }],
        }),
      })
      if (res.ok) {
        checks.checks.anthropic_api = { status: 'ok', response_status: res.status }
      } else {
        const errBody = await res.text()
        checks.checks.anthropic_api = {
          status: 'fail',
          response_status: res.status,
          error: errBody.substring(0, 200),
        }
      }
    } catch (err: any) {
      checks.checks.anthropic_api = { status: 'fail', error: err.message }
    }
  } else {
    checks.checks.anthropic_api = { status: 'skip', reason: 'No API key to test with' }
  }

  // Check 4: Vercel environment
  checks.checks.environment = {
    status: 'ok',
    node_version: process.version,
    vercel_env: process.env.VERCEL_ENV || 'unknown',
    region: process.env.VERCEL_REGION || 'unknown',
    max_duration: '120s (Pro plan required)',
  }

  // Set overall status
  const anyFail = Object.values(checks.checks).some((c: any) => c.status === 'fail')
  checks.status = anyFail ? 'degraded' : 'ok'

  return NextResponse.json(checks, { status: anyFail ? 503 : 200 })
}
