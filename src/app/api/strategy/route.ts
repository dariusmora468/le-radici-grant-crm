import { validateAuth } from '@/lib/api-auth'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

// GET = diagnostic mode
export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  return NextResponse.json({
    route: '/api/strategy',
    status: apiKey ? 'READY' : 'NOT READY',
    checks: {
      api_key: apiKey
        ? { status: 'ok', length: apiKey.length, prefix: apiKey.substring(0, 10) + '...' }
        : { status: 'FAIL', error: 'ANTHROPIC_API_KEY not set. Add it in Vercel > Settings > Environment Variables.' },
      vercel_env: process.env.VERCEL_ENV || 'unknown',
    },
  })
}

export async function POST(req: NextRequest) {
  const startTime = Date.now()

  try {
    const authError = await validateAuth(req)
    if (authError) return authError
    // Step 1: Parse request
    let body
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body. Expected JSON.', error_code: 'BAD_REQUEST' }, { status: 400 })
    }

    const { grant, project } = body
    if (!grant || !project) {
      return NextResponse.json({ error: 'Missing "grant" or "project" in request.', error_code: 'MISSING_FIELDS' }, { status: 400 })
    }

    // Step 2: Check API key
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({
        error: 'ANTHROPIC_API_KEY not configured. Add it in Vercel > Settings > Environment Variables.',
        error_code: 'MISSING_API_KEY',
      }, { status: 500 })
    }

    // Step 3: Build the prompt
    const systemPrompt = `You are a senior EU grant application strategist. You analyze a specific grant opportunity against a project profile and produce a practical, actionable strategy.

Be specific, direct, and realistic. Do not be overly optimistic. Flag real problems honestly.
Today's date is ${new Date().toISOString().split('T')[0]}.

Respond with ONLY a JSON object (no markdown, no backticks, no preamble):
{
  "summary": "2-3 sentence assessment of this grant for this specific project. Be concrete about fit.",
  "probability_of_success": "High" | "Medium" | "Low",
  "probability_reasoning": "2-3 sentences explaining the probability assessment with specific reasons.",
  "estimated_amount_min": <number in EUR>,
  "estimated_amount_max": <number in EUR>,
  "next_steps": [
    {
      "step": "Specific, actionable task (start with a verb)",
      "detail": "2-3 sentences explaining exactly what to do, who to contact, or what to prepare",
      "deadline": "Suggested deadline (e.g., 'Within 1 week', 'Before March 15')",
      "effort": "Low" | "Medium" | "High"
    }
  ],
  "blockers": [
    {
      "title": "Short title of the blocker or warning",
      "description": "What the issue is and why it matters",
      "severity": "critical" | "warning" | "info",
      "resolution": "Specific steps to resolve this",
      "resolution_time": "Estimated time to resolve",
      "affected_area": "What part of the application this blocks (e.g., 'Eligibility', 'Documentation', 'Timeline')"
    }
  ],
  "required_documents": [
    {
      "document": "Official document name",
      "description": "What this document must contain and its purpose in the application",
      "status": "likely_ready" | "needs_preparation" | "missing" | "blocked",
      "effort": "Low" | "Medium" | "High",
      "how_to_prepare": "Step-by-step guide to prepare this document",
      "ai_can_help": "Specific way AI can assist (e.g., 'Can draft the business plan narrative', 'Can create financial projections template', 'Can translate documents to Italian'). Be specific about what AI can actually generate vs what requires human input or official stamps."
    }
  ],
  "improvements": [
    {
      "change": "Specific change the project could make to increase success chances",
      "impact": "High" | "Medium" | "Low",
      "impact_detail": "How this change specifically improves the application (e.g., 'Moves probability from Medium to High', 'Unlocks additional 20% funding bonus', 'Satisfies a preferred criterion worth 15 points')",
      "effort_to_implement": "What it would take to make this change",
      "category": "Entity" | "Team" | "Project Scope" | "Documentation" | "Timeline" | "Financial" | "Sustainability"
    }
  ],
  "insider_tip": "One powerful, specific piece of insider advice about this grant type that most applicants miss. This should be something a consultant would charge money to tell you."
}

IMPORTANT RULES:
- next_steps should be 4-6 concrete actions, ordered by priority. These become a to-do list.
- blockers should include ALL issues (critical problems AND minor warnings), sorted by severity (critical first, then warning, then info). Merge what would be "risks" and "warnings" into this one list.
- required_documents should list every document needed, with honest status assessment based on the project profile. The ai_can_help field is crucial: be specific about what an AI assistant can draft or template.
- improvements should list 3-5 specific changes. Think creatively about what the project could adjust (entity structure, team composition, project scope, sustainability features, timeline) to better match grant criteria. Each must have a concrete impact assessment.
- insider_tip should be genuinely valuable, not generic advice. Think about what experienced consultants know about this specific grant program.`

    const userPrompt = buildUserPrompt(grant, project)

    // Step 4: Call Anthropic API (no web search, fast)
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
          max_tokens: 6000,
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

    // Step 5: Handle non-OK response
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
        api_status: response.status,
        duration_ms: Date.now() - startTime,
      }, { status: 502 })
    }

    // Step 6: Parse response
    let data
    try {
      data = await response.json()
    } catch {
      return NextResponse.json({
        error: 'Anthropic returned invalid JSON response.',
        error_code: 'API_INVALID_JSON',
        duration_ms: Date.now() - startTime,
      }, { status: 502 })
    }

    // Step 7: Extract text
    if (!data.content || !Array.isArray(data.content)) {
      return NextResponse.json({
        error: 'Anthropic response missing content.',
        error_code: 'API_BAD_FORMAT',
        duration_ms: Date.now() - startTime,
      }, { status: 502 })
    }

    const text = data.content
      .filter((item: any) => item.type === 'text')
      .map((item: any) => item.text)
      .join('\n')

    if (!text || text.trim().length === 0) {
      return NextResponse.json({
        error: 'AI returned empty response. Please try again.',
        error_code: 'EMPTY_TEXT',
        duration_ms: Date.now() - startTime,
      }, { status: 502 })
    }

    // Step 8: Parse JSON from text
    let strategy
    try {
      const cleaned = text.replace(/```json|```/g, '').trim()
      try {
        strategy = JSON.parse(cleaned)
      } catch {
        const match = cleaned.match(/\{[\s\S]*\}/)
        if (match) {
          strategy = JSON.parse(match[0])
        } else {
          throw new Error('No JSON object found in response')
        }
      }
    } catch (parseErr: any) {
      return NextResponse.json({
        error: 'AI response was not in expected format. Please try again.',
        error_code: 'PARSE_FAILED',
        raw_preview: text.substring(0, 300),
        duration_ms: Date.now() - startTime,
      }, { status: 500 })
    }

    // Step 9: Validate required fields
    if (!strategy.summary || !strategy.probability_of_success) {
      return NextResponse.json({
        error: 'AI response missing required fields (summary, probability).',
        error_code: 'INVALID_STRUCTURE',
        keys_found: Object.keys(strategy),
        duration_ms: Date.now() - startTime,
      }, { status: 500 })
    }

    return NextResponse.json({
      ...strategy,
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

function buildUserPrompt(grant: any, project: any): string {
  return `Analyze this specific grant opportunity for this project:

=== GRANT ===
Name: ${grant.name || 'Unknown'}
Local name: ${grant.name_it || 'N/A'}
Funding source: ${grant.funding_source || 'Unknown'}
Funding type: ${grant.funding_type || 'Unknown'}
Amount range: EUR ${grant.min_amount?.toLocaleString() || '?'} - ${grant.max_amount?.toLocaleString() || '?'}
Co-financing required: ${grant.co_financing_pct ? grant.co_financing_pct + '%' : 'Unknown'}
Eligibility: ${grant.eligibility_summary || 'Not specified'}
Requires young farmer: ${grant.requires_young_farmer ? 'Yes' : 'No'}
Requires female farmer: ${grant.requires_female_farmer ? 'Yes' : 'No'}
Requires agricultural entity: ${grant.requires_agricultural_entity ? 'Yes' : 'No'}
Requires heritage (BSA): ${grant.requires_bsa_heritage ? 'Yes' : 'No'}
Window opens: ${grant.application_window_opens || 'Unknown'}
Window closes: ${grant.application_window_closes || 'Unknown'}
Window status: ${grant.window_status || 'Unknown'}
Official URL: ${grant.official_url || 'N/A'}
Regulation: ${grant.regulation_reference || 'N/A'}
Description: ${grant.description || 'No description'}
Why relevant: ${grant.why_relevant || 'Not specified'}
Known risks: ${grant.risks || 'Not specified'}

=== PROJECT ===
Name: ${project.name || 'Unknown'}
Country: ${project.country || 'Unknown'}
Region: ${project.region || 'Unknown'}
Municipality: ${project.municipality || 'Unknown'}
Description: ${project.summary || project.description || project.raw_description || 'No description'}
Entity type: ${project.entity_type || 'Unknown'}
Entity status: ${project.entity_status || 'Unknown'}
Young farmer eligible: ${project.young_farmer_eligible ?? 'Unknown'}
Female farmer eligible: ${project.female_farmer_eligible ?? 'Unknown'}
Primary sector: ${project.primary_sector || 'Unknown'}
Heritage classification: ${project.heritage_classification || 'None'}
Landscape protections: ${project.landscape_protections || 'None'}
Land area: ${project.land_area_hectares ? project.land_area_hectares + ' hectares' : 'Unknown'}
Total investment: ${project.total_investment_estimate ? 'EUR ' + project.total_investment_estimate.toLocaleString() : 'Unknown'}
Own capital: ${project.own_capital_available ? 'EUR ' + project.own_capital_available.toLocaleString() : 'Unknown'}
Co-financing capacity: ${project.co_financing_capacity_pct ? project.co_financing_capacity_pct + '%' : 'Unknown'}
Timeline: ${project.project_start_date || 'Unknown'} to ${project.expected_completion_date || 'Unknown'}
Team qualifications: ${project.key_qualifications || 'Unknown'}
ATECO codes: ${project.ateco_codes || 'Not set'}

Produce a practical strategy for applying to this specific grant. Be honest about blockers and probability.`
}
