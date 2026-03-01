import { validateAuth } from '@/lib/api-auth'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

// GET = diagnostic mode
export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  return NextResponse.json({
    route: '/api/discover-grants',
    status: apiKey ? 'READY' : 'NOT READY',
    checks: {
      api_key: apiKey
        ? { status: 'ok', length: apiKey.length, prefix: apiKey.substring(0, 10) + '...' }
        : { status: 'FAIL', error: 'ANTHROPIC_API_KEY not set.' },
    },
  })
}

export async function POST(req: NextRequest) {
  const startTime = Date.now()

  try {
    const authError = await validateAuth(req)
    if (authError) return authError

    let body
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body.', error_code: 'BAD_REQUEST' }, { status: 400 })
    }

    const { project, existingGrantNames } = body
    if (!project) {
      return NextResponse.json({ error: 'Missing "project" in request.', error_code: 'MISSING_FIELDS' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured.', error_code: 'MISSING_API_KEY' }, { status: 500 })
    }

    const systemPrompt = `You are a senior EU funding specialist with deep expertise in Italian and European grant programs. Your job is to discover grant opportunities that match a specific project profile.

Search your knowledge of ALL available funding programs including:
- EU structural funds (ERDF, ESF+, EAFRD, EMFAF)
- Italian national programs (PNRR, ISMEA, Invitalia, tax credits)
- Regional programs (specific to the project's region)
- Ministry-specific programs (Culture, Agriculture, Tourism, Environment)
- Cross-border and international programs
- Tax incentives and fiscal benefits
- Private foundations and alternative funding

Today's date is ${new Date().toISOString().split('T')[0]}.

Respond with ONLY a JSON object (no markdown, no backticks):
{
  "grants": [
    {
      "name": "Official English name of the grant/program",
      "name_it": "Official Italian name (if applicable, null otherwise)",
      "funding_source": "EU" | "National" | "Regional" | "Municipal" | "Private" | "Mixed",
      "funding_type": "Grant" | "Tax Credit" | "Subsidized Loan" | "Mixed" | "Guarantee" | "Equity",
      "category": "Agriculture" | "Heritage & Culture" | "Tourism & Hospitality" | "Energy & Sustainability" | "Innovation & Digital" | "Young Entrepreneurs" | "Rural Development" | "Infrastructure",
      "min_amount": <number in EUR or null>,
      "max_amount": <number in EUR or null>,
      "co_financing_pct": <number 0-100 or null>,
      "description": "2-3 sentence description of what this funds and who it's for",
      "eligibility_summary": "Key eligibility requirements in 1-2 sentences",
      "why_relevant": "Specific reasons this matches the project profile (be concrete)",
      "window_status": "Open" | "Rolling" | "Not yet open" | "Expected soon",
      "application_window_opens": "YYYY-MM-DD or null",
      "application_window_closes": "YYYY-MM-DD or null",
      "official_url": "URL to the official program page or null",
      "relevance_score": <1-100 integer, be honest>,
      "effort_level": "Low" | "Medium" | "High" | "Very High",
      "requires_young_farmer": <boolean>,
      "requires_agricultural_entity": <boolean>,
      "requires_bsa_heritage": <boolean>
    }
  ],
  "search_summary": "Brief summary of what you found and key patterns",
  "total_potential_min": <estimated minimum total funding in EUR>,
  "total_potential_max": <estimated maximum total funding in EUR>
}

RULES:
- Find 8-15 grants. Quality over quantity.
- Sort by relevance_score descending (best matches first).
- Be realistic about relevance scores. 90+ means near-perfect fit. 50-70 means partial fit with gaps.
- If a program is closed but expected to reopen, include it with status "Expected soon".
- Do NOT include programs that are clearly not a fit.
- Be specific in why_relevant -- reference actual project attributes.
- Include the official URL when you know it.`

    const existingNames = existingGrantNames?.length
      ? `\n\nGrants already in the user's database (do NOT repeat these, find NEW ones):\n${existingGrantNames.map((n: string) => `- ${n}`).join('\n')}`
      : ''

    const userPrompt = `Find all relevant grant and funding opportunities for this project:

=== PROJECT PROFILE ===
Name: ${project.name || 'Unknown'}
Country: ${project.country || 'Unknown'}
Region: ${project.region || 'Unknown'}
Municipality: ${project.municipality || 'Unknown'}
Description: ${project.summary || project.description || 'No description'}
Entity type: ${project.entity_type || 'Unknown'}
Entity status: ${project.entity_status || 'Unknown'}
Young farmer eligible: ${project.young_farmer_eligible ?? 'Unknown'}
Female farmer eligible: ${project.female_farmer_eligible ?? 'Unknown'}
Primary sector: ${project.primary_sector || 'Unknown'}
Secondary sectors: ${project.secondary_sectors?.join(', ') || 'None'}
Heritage classification: ${project.heritage_classification || 'None'}
Landscape protections: ${project.landscape_protections || 'None'}
Land area: ${project.land_area_hectares ? project.land_area_hectares + ' hectares' : 'Unknown'}
Building area: ${project.building_area_sqm ? project.building_area_sqm + ' sqm' : 'Unknown'}
Total investment: ${project.total_investment_estimate ? 'EUR ' + Number(project.total_investment_estimate).toLocaleString() : 'Unknown'}
Own capital: ${project.own_capital_available ? 'EUR ' + Number(project.own_capital_available).toLocaleString() : 'Unknown'}
Co-financing capacity: ${project.co_financing_capacity_pct ? project.co_financing_capacity_pct + '%' : 'Unknown'}
Objectives: ${project.objectives?.join(', ') || 'Not specified'}
Sustainability goals: ${project.sustainability_goals || 'Not specified'}
Team size: ${project.team_size || 'Unknown'}
Key qualifications: ${project.key_qualifications || 'Unknown'}
ATECO codes: ${project.ateco_codes || 'Not set'}
Timeline: ${project.project_start_date || 'Unknown'} to ${project.expected_completion_date || 'Unknown'}
Urgency: ${project.urgency || 'Unknown'}${existingNames}

Find the best matching grant opportunities. Include EU, national, regional, and any other relevant funding sources.`

    let response
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 8000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      })
    } catch (fetchErr: any) {
      return NextResponse.json({
        error: `Could not reach Anthropic API: ${fetchErr.message}`,
        error_code: 'API_UNREACHABLE',
        duration_ms: Date.now() - startTime,
      }, { status: 502 })
    }

    if (!response.ok) {
      let errDetail = `Status ${response.status}`
      try {
        const errData = await response.json()
        errDetail = errData?.error?.message || JSON.stringify(errData).substring(0, 300)
      } catch {
        try { errDetail = (await response.text()).substring(0, 300) } catch {}
      }
      return NextResponse.json({
        error: `Anthropic API error: ${errDetail}`,
        error_code: 'API_ERROR',
        duration_ms: Date.now() - startTime,
      }, { status: 502 })
    }

    let data
    try {
      data = await response.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON from API.', error_code: 'API_INVALID_JSON', duration_ms: Date.now() - startTime }, { status: 502 })
    }

    const text = data.content
      ?.filter((item: any) => item.type === 'text')
      .map((item: any) => item.text)
      .join('\n') || ''

    if (!text.trim()) {
      return NextResponse.json({ error: 'AI returned empty response.', error_code: 'EMPTY_TEXT', duration_ms: Date.now() - startTime }, { status: 502 })
    }

    let result
    try {
      const cleaned = text.replace(/```json|```/g, '').trim()
      try {
        result = JSON.parse(cleaned)
      } catch {
        const match = cleaned.match(/\{[\s\S]*\}/)
        if (match) {
          result = JSON.parse(match[0])
        } else {
          throw new Error('No JSON found')
        }
      }
    } catch (parseErr: any) {
      return NextResponse.json({
        error: 'AI response was not valid JSON. Please try again.',
        error_code: 'PARSE_FAILED',
        raw_preview: text.substring(0, 300),
        duration_ms: Date.now() - startTime,
      }, { status: 500 })
    }

    if (!result.grants || !Array.isArray(result.grants)) {
      return NextResponse.json({
        error: 'AI response missing grants array.',
        error_code: 'INVALID_STRUCTURE',
        duration_ms: Date.now() - startTime,
      }, { status: 500 })
    }

    return NextResponse.json({
      ...result,
      duration_ms: Date.now() - startTime,
    })

  } catch (err: any) {
    return NextResponse.json({
      error: `Unexpected error: ${err.message}`,
      error_code: 'UNEXPECTED',
      duration_ms: Date.now() - startTime,
    }, { status: 500 })
  }
}
