import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 300 // 5 min on Pro plan

export async function GET(req: NextRequest) {
  // Verify cron secret to prevent unauthorized triggers
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  // Allow if: has valid cron secret OR no cron secret configured (dev mode)
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    // Get all grants that are in active pipeline stages
    const pipelineRes = await fetch(
      `${supabaseUrl}/rest/v1/grant_applications?select=grant_id&stage=not.in.(Archived,Rejected)`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    )
    const pipelineGrants = await pipelineRes.json()
    const pipelineGrantIds = new Set((pipelineGrants || []).map((p: any) => p.grant_id).filter(Boolean))

    // Also include all grants not verified in last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const staleRes = await fetch(
      `${supabaseUrl}/rest/v1/grants?select=id&or=(last_verified_at.is.null,last_verified_at.lt.${sevenDaysAgo})`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    )
    const staleGrants = await staleRes.json()
    const staleGrantIds = new Set((staleGrants || []).map((g: any) => g.id))

    // Combine: pipeline grants + stale grants
    const allGrantIds = Array.from(new Set([...Array.from(pipelineGrantIds), ...Array.from(staleGrantIds)]))

    if (allGrantIds.length === 0) {
      return NextResponse.json({
        status: 'complete',
        message: 'No grants need verification',
        verified: 0,
        duration_ms: Date.now() - startTime,
      })
    }

    // Process sequentially to avoid API rate limits
    const results: any[] = []
    let verified = 0
    let failed = 0

    for (const grantId of allGrantIds) {
      // Check if we're approaching timeout (leave 30s buffer)
      if (Date.now() - startTime > 270000) {
        results.push({ grant_id: 'TIMEOUT', message: `Stopped after ${verified} grants due to timeout` })
        break
      }

      try {
        // Fetch app password for internal API auth
        const pwRes = await fetch(`${supabaseUrl}/rest/v1/app_settings?key=eq.app_password&select=value&limit=1`, {
          headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
        })
        const pwData = await pwRes.json()
        const appPassword = pwData?.[0]?.value || ''

        const res = await fetch(`${baseUrl}/api/verify-grant`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-app-password': appPassword },
          body: JSON.stringify({ grant_id: grantId }),
        })

        if (res.ok) {
          const data = await res.json()
          results.push({
            grant_id: grantId,
            status: data.status,
            confidence: data.confidence,
            checks: `${data.checks_passed}/${data.checks_total}`,
            issues: data.issues?.length || 0,
            duration_ms: data.duration_ms,
          })
          verified++
        } else {
          const err = await res.text()
          results.push({ grant_id: grantId, error: err })
          failed++
        }
      } catch (err: any) {
        results.push({ grant_id: grantId, error: err.message })
        failed++
      }

      // Small delay between verifications to be gentle on APIs
      await new Promise(r => setTimeout(r, 1000))
    }

    return NextResponse.json({
      status: 'complete',
      total_queued: allGrantIds.length,
      verified,
      failed,
      pipeline_grants: pipelineGrantIds.size,
      stale_grants: staleGrantIds.size,
      results,
      duration_ms: Date.now() - startTime,
    })
  } catch (err: any) {
    console.error('Bulk verification error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
