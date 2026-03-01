import { validateAuth } from '@/lib/api-auth'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 120

// ============================================
// PHASE 1: URL VALIDATION
// ============================================
async function validateUrl(url: string, grantName: string): Promise<{
  url_valid: boolean
  url_status_code: number | null
  url_contains_grant_name: boolean
  url_domain: string
  url_is_government: boolean
  page_text: string | null
}> {
  const result = {
    url_valid: false,
    url_status_code: null as number | null,
    url_contains_grant_name: false,
    url_domain: '',
    url_is_government: false,
    page_text: null as string | null,
  }

  try {
    const fullUrl = url.startsWith('http') ? url : `https://${url}`
    const parsed = new URL(fullUrl)
    result.url_domain = parsed.hostname

    // Check if government domain
    const govPatterns = [
      '.gov.it', '.europa.eu', '.regione.', '.governo.it', '.mise.gov',
      '.ismea.it', '.invitalia.it', '.gse.it', '.enea.it',
      '.agea.gov.it', '.politicheagricole.it', '.mase.gov.it',
      '.cultura.gov.it', '.beniculturali.it', '.toscana.it',
    ]
    result.url_is_government = govPatterns.some(p => result.url_domain.includes(p) || result.url_domain.endsWith(p.replace('.', '')))

    // Fetch the page
    const res = await fetch(fullUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GrantFlow-Verification/1.0)' },
    })

    result.url_status_code = res.status
    result.url_valid = res.ok || res.status === 403 // 403 may just be bot protection

    if (res.ok) {
      const html = await res.text()
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

      result.page_text = text.substring(0, 4000)

      // Check if page mentions the grant name (fuzzy match)
      const nameLower = grantName.toLowerCase()
      const textLower = text.toLowerCase()
      // Check full name or significant keywords from the name
      const keywords = nameLower.split(/\s+/).filter(w => w.length > 4)
      const keywordMatches = keywords.filter(k => textLower.includes(k)).length
      result.url_contains_grant_name = textLower.includes(nameLower) || (keywords.length > 0 && keywordMatches >= Math.ceil(keywords.length * 0.5))
    }
  } catch {
    // URL fetch failed entirely
    result.url_valid = false
  }

  return result
}

// ============================================
// PHASE 2: SOURCE QUALITY SCORING
// ============================================
function scoreSourceQuality(domain: string, isGovernment: boolean, urlValid: boolean): {
  source_quality_score: number
  source_type: string
  source_domain_authority: string
} {
  if (!urlValid || !domain) {
    return { source_quality_score: 0, source_type: 'unknown', source_domain_authority: 'none' }
  }

  if (isGovernment) {
    // Tier government domains
    const topGov = ['.europa.eu', '.gov.it', 'ismea.it', 'invitalia.it', 'gse.it']
    const isTop = topGov.some(g => domain.includes(g))
    if (isTop) return { source_quality_score: 95, source_type: 'official_government', source_domain_authority: 'top_tier' }
    return { source_quality_score: 85, source_type: 'government', source_domain_authority: 'high' }
  }

  // Known quality non-gov sources
  const qualitySources = ['simest.it', 'sace.it', 'cdp.it', 'ice.it', 'unioncamere.it']
  if (qualitySources.some(s => domain.includes(s))) {
    return { source_quality_score: 75, source_type: 'institutional', source_domain_authority: 'high' }
  }

  // Consulting/professional sites
  const consultingSuffixes = ['.it', '.eu', '.com']
  const hasProDomain = consultingSuffixes.some(s => domain.endsWith(s))
  if (hasProDomain) {
    return { source_quality_score: 45, source_type: 'third_party', source_domain_authority: 'medium' }
  }

  return { source_quality_score: 25, source_type: 'unknown', source_domain_authority: 'low' }
}

// ============================================
// PHASE 3: CROSS-REFERENCE VERIFICATION
// ============================================
async function crossReferenceGrant(
  grant: any,
  apiKey: string
): Promise<{
  crossref_ran: boolean
  crossref_amount_match: boolean | null
  crossref_deadline_match: boolean | null
  crossref_eligibility_match: boolean | null
  crossref_discrepancies: any[]
  crossref_fresh_data: Record<string, any>
}> {
  const result = {
    crossref_ran: false,
    crossref_amount_match: null as boolean | null,
    crossref_deadline_match: null as boolean | null,
    crossref_eligibility_match: null as boolean | null,
    crossref_discrepancies: [] as any[],
    crossref_fresh_data: {} as Record<string, any>,
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: `You are a grant data verification specialist. Your job is to INDEPENDENTLY research a grant program and compare what you find against existing database records.

Search the web for the OFFICIAL, CURRENT information about this grant. Focus on:
1. The EXACT maximum and minimum funding amounts
2. The CURRENT application window (open date, close date, status)
3. Eligibility requirements
4. Whether the program is still active in 2026

After researching, compare your findings against the database values provided and report any discrepancies.

CRITICAL: Respond with ONLY a JSON object. No markdown, no backticks, no preamble.

{
  "program_found": true/false,
  "program_still_active": true/false,
  "fresh_data": {
    "max_amount": number or null,
    "min_amount": number or null,
    "application_deadline": "YYYY-MM-DD" or null,
    "window_status": "Open"/"Closed"/"Rolling"/"Not yet open"/"Unknown",
    "eligibility_summary": "brief text" or null,
    "official_url": "URL found" or null
  },
  "comparisons": {
    "amount_match": true/false/null,
    "deadline_match": true/false/null,
    "eligibility_match": true/false/null
  },
  "discrepancies": [
    {
      "field": "field name",
      "database_value": "what DB says",
      "fresh_value": "what research found",
      "severity": "critical"/"warning"/"info",
      "explanation": "why this matters"
    }
  ],
  "confidence_notes": "brief assessment of data quality"
}`,
        messages: [{
          role: 'user',
          content: `INDEPENDENTLY verify this grant. Search the web for current, official information and compare against our database record.

GRANT NAME: ${grant.name}
${grant.name_it ? `ITALIAN NAME: ${grant.name_it}` : ''}
FUNDING SOURCE: ${grant.funding_source || 'Unknown'}
${grant.regulation_reference ? `REGULATION: ${grant.regulation_reference}` : ''}

DATABASE VALUES TO VERIFY:
- Max amount: ${grant.max_amount ? '€' + grant.max_amount.toLocaleString() : 'Not set'}
- Min amount: ${grant.min_amount ? '€' + grant.min_amount.toLocaleString() : 'Not set'}
- Application deadline: ${grant.application_window_closes || 'Not set'}
- Window status: ${grant.window_status || 'Unknown'}
- Eligibility: ${grant.eligibility_summary || 'Not set'}
- Official URL: ${grant.official_url || 'Not set'}

Today's date: ${new Date().toISOString().split('T')[0]}

Search for the OFFICIAL source of this grant program and verify each field above.`,
        }],
      }),
    })

    if (!response.ok) {
      console.error('Cross-reference API error:', response.status)
      return result
    }

    const data = await response.json()

    // Extract text from all content blocks
    const textParts = data.content
      .filter((item: any) => item.type === 'text')
      .map((item: any) => item.text)

    // Also check tool_result blocks for text content
    const toolResultParts = data.content
      .filter((item: any) => item.type === 'tool_result')
      .flatMap((item: any) => {
        if (Array.isArray(item.content)) {
          return item.content.filter((c: any) => c.type === 'text').map((c: any) => c.text)
        }
        return []
      })

    const allText = [...textParts, ...toolResultParts].join('\n')

    // Parse JSON from the response
    const cleaned = allText.replace(/```json|```/g, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])

      result.crossref_ran = true
      result.crossref_fresh_data = parsed.fresh_data || {}

      if (parsed.comparisons) {
        result.crossref_amount_match = parsed.comparisons.amount_match ?? null
        result.crossref_deadline_match = parsed.comparisons.deadline_match ?? null
        result.crossref_eligibility_match = parsed.comparisons.eligibility_match ?? null
      }

      if (Array.isArray(parsed.discrepancies)) {
        result.crossref_discrepancies = parsed.discrepancies
      }

      // If program not found or not active, that's a critical discrepancy
      if (parsed.program_found === false) {
        result.crossref_discrepancies.push({
          field: 'program_existence',
          database_value: 'Listed as active',
          fresh_value: 'Program not found via web search',
          severity: 'critical',
          explanation: 'Could not verify this grant program exists. It may have been discontinued, renamed, or the search terms may not match.',
        })
      } else if (parsed.program_still_active === false) {
        result.crossref_discrepancies.push({
          field: 'program_status',
          database_value: grant.window_status || 'Unknown',
          fresh_value: 'Program appears inactive/closed',
          severity: 'critical',
          explanation: 'This program may no longer be accepting applications.',
        })
      }
    }
  } catch (err) {
    console.error('Cross-reference parse error:', err)
    // Don't fail the whole verification, just mark crossref as not run
  }

  return result
}

// ============================================
// COMPUTE OVERALL CONFIDENCE
// ============================================
function computeConfidence(
  urlResult: Awaited<ReturnType<typeof validateUrl>>,
  sourceResult: ReturnType<typeof scoreSourceQuality>,
  crossrefResult: Awaited<ReturnType<typeof crossReferenceGrant>>,
): { confidence: number; status: string; checks_passed: number; checks_total: number; issues: any[] } {
  const issues: any[] = []
  let checks_passed = 0
  let checks_total = 0

  // URL checks (30 points max)
  let urlScore = 0
  checks_total += 2
  if (urlResult.url_valid) {
    urlScore += 15
    checks_passed++
  } else {
    issues.push({ type: 'url', severity: 'warning', message: `Official URL is not accessible (${urlResult.url_status_code || 'no response'})` })
  }
  if (urlResult.url_contains_grant_name) {
    urlScore += 15
    checks_passed++
  } else if (urlResult.url_valid) {
    issues.push({ type: 'url', severity: 'info', message: 'Official URL does not appear to contain grant-specific content' })
  }

  // Source quality (25 points max)
  const sourceScore = Math.round(sourceResult.source_quality_score * 0.25)
  checks_total++
  if (sourceResult.source_quality_score >= 70) {
    checks_passed++
  } else if (sourceResult.source_quality_score < 40) {
    issues.push({ type: 'source', severity: 'warning', message: `Source is ${sourceResult.source_type} (${sourceResult.source_domain_authority} authority)` })
  }

  // Cross-reference (45 points max)
  let crossrefScore = 0
  if (crossrefResult.crossref_ran) {
    const fields = [
      { match: crossrefResult.crossref_amount_match, name: 'amount', points: 20 },
      { match: crossrefResult.crossref_deadline_match, name: 'deadline', points: 15 },
      { match: crossrefResult.crossref_eligibility_match, name: 'eligibility', points: 10 },
    ]

    for (const field of fields) {
      if (field.match === null) continue // Could not verify, skip
      checks_total++
      if (field.match) {
        crossrefScore += field.points
        checks_passed++
      } else {
        issues.push({
          type: 'crossref',
          severity: field.name === 'amount' ? 'critical' : 'warning',
          message: `${field.name} does not match fresh research`,
        })
      }
    }

    // Critical discrepancies
    const criticalDisc = crossrefResult.crossref_discrepancies.filter(d => d.severity === 'critical')
    if (criticalDisc.length > 0) {
      crossrefScore = Math.max(0, crossrefScore - 20)
      for (const d of criticalDisc) {
        issues.push({ type: 'crossref', severity: 'critical', message: d.explanation || `Critical: ${d.field} mismatch` })
      }
    }
  }

  const confidence = Math.min(100, Math.max(0, urlScore + sourceScore + crossrefScore))

  // Determine status
  let status = 'unverified'
  const hasCritical = issues.some(i => i.severity === 'critical')
  const hasWarning = issues.some(i => i.severity === 'warning')

  if (hasCritical) {
    status = 'failed'
  } else if (confidence >= 70 && !hasWarning) {
    status = 'verified'
  } else if (confidence >= 40 || hasWarning) {
    status = 'warning'
  } else {
    status = 'failed'
  }

  return { confidence, status, checks_passed, checks_total, issues }
}

// ============================================
// MAIN HANDLER
// ============================================
export async function POST(req: NextRequest) {
  const startTime = Date.now()

  try {
    const authError = await validateAuth(req)
    if (authError) return authError
    const { grant_id } = await req.json()
    if (!grant_id) {
      return NextResponse.json({ error: 'Missing grant_id' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    // Fetch the grant
    const grantRes = await fetch(`${supabaseUrl}/rest/v1/grants?id=eq.${grant_id}&select=*`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
    })
    const grants = await grantRes.json()
    if (!grants || grants.length === 0) {
      return NextResponse.json({ error: 'Grant not found' }, { status: 404 })
    }
    const grant = grants[0]

    // PHASE 1: URL Validation
    const urlResult = grant.official_url
      ? await validateUrl(grant.official_url, grant.name)
      : { url_valid: false, url_status_code: null, url_contains_grant_name: false, url_domain: '', url_is_government: false, page_text: null }

    // PHASE 2: Source Quality
    const sourceResult = scoreSourceQuality(urlResult.url_domain, urlResult.url_is_government, urlResult.url_valid)

    // PHASE 3: Cross-Reference
    const crossrefResult = await crossReferenceGrant(grant, apiKey)

    // COMPUTE CONFIDENCE
    const { confidence, status, checks_passed, checks_total, issues } = computeConfidence(urlResult, sourceResult, crossrefResult)

    const duration_ms = Date.now() - startTime

    // Save verification log
    await fetch(`${supabaseUrl}/rest/v1/grant_verifications`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        grant_id,
        overall_confidence: confidence,
        status,
        url_valid: urlResult.url_valid,
        url_status_code: urlResult.url_status_code,
        url_contains_grant_name: urlResult.url_contains_grant_name,
        url_domain: urlResult.url_domain,
        url_is_government: urlResult.url_is_government,
        crossref_ran: crossrefResult.crossref_ran,
        crossref_amount_match: crossrefResult.crossref_amount_match,
        crossref_deadline_match: crossrefResult.crossref_deadline_match,
        crossref_eligibility_match: crossrefResult.crossref_eligibility_match,
        crossref_discrepancies: crossrefResult.crossref_discrepancies,
        crossref_fresh_data: crossrefResult.crossref_fresh_data,
        source_quality_score: sourceResult.source_quality_score,
        source_type: sourceResult.source_type,
        source_domain_authority: sourceResult.source_domain_authority,
        checks_passed,
        checks_total,
        issues,
        duration_ms,
      }),
    })

    // Update the grant record
    await fetch(`${supabaseUrl}/rest/v1/grants?id=eq.${grant_id}`, {
      method: 'PATCH',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        verification_status: status,
        verification_confidence: confidence,
        last_verified_at: new Date().toISOString(),
        verification_details: {
          checks_passed,
          checks_total,
          issues,
          source_type: sourceResult.source_type,
          crossref_ran: crossrefResult.crossref_ran,
          discrepancy_count: crossrefResult.crossref_discrepancies.length,
          fresh_data: crossrefResult.crossref_fresh_data,
          duration_ms,
        },
        updated_at: new Date().toISOString(),
      }),
    })

    return NextResponse.json({
      grant_id,
      status,
      confidence,
      checks_passed,
      checks_total,
      issues,
      source: sourceResult,
      crossref_discrepancies: crossrefResult.crossref_discrepancies,
      fresh_data: crossrefResult.crossref_fresh_data,
      duration_ms,
    })
  } catch (err: any) {
    console.error('Verification error:', err)
    return NextResponse.json({ error: err.message || 'Verification failed' }, { status: 500 })
  }
}

export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  return NextResponse.json({
    status: 'ok',
    api_key_set: !!apiKey,
    endpoint: '/api/verify-grant',
    method: 'POST { grant_id: "uuid" }',
    checks: ['URL validation', 'Source quality scoring', 'Cross-reference via AI web search'],
  })
}
