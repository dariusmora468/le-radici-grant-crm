import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    const { project } = await req.json()
    if (!project) {
      return NextResponse.json({ error: 'Missing project data' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
    }

    // Build a rich project context from the pre-application profile
    const projectContext = buildProjectContext(project)

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: `You are a senior EU grant strategy consultant with deep expertise in European structural funds, national and regional grant programs, agricultural subsidies, heritage and culture funding, energy transition grants, and young farmer incentives across all EU member states.

Your task is to analyze a project profile and produce a comprehensive grant application strategy. You must:

1. Search the web to find CURRENT, OPEN or UPCOMING grant opportunities that match this specific project
2. Rank the top 10 grants by probability of success (considering eligibility match, project alignment, competition level, and timing)
3. For each grant, specify exactly what documents are required
4. Identify any blockers (missing information, prerequisites not met, entity issues)
5. Create a sequenced action plan (what to apply for first, second, third)
6. Be specific to the project's country, region, and sector

CRITICAL RULES:
- Only recommend grants the project actually qualifies for based on the profile data
- If critical information is missing (e.g., entity not established), flag it as a CRITICAL blocker
- Consider the project's timeline and urgency when sequencing applications
- Include a mix of grant types: direct grants, subsidized loans, tax credits, in-kind support
- Search in the local language of the project's country for better results
- Today's date is ${new Date().toISOString().split('T')[0]}

Respond with ONLY a JSON object (no markdown, no backticks, no preamble). The structure must be:
{
  "executive_summary": "3-4 sentence overview of the strategy and total potential funding",
  "total_potential_value": <number in EUR>,
  "grants_ranked": [
    {
      "rank": 1,
      "name": "Grant name in English",
      "name_local": "Grant name in local language",
      "funding_source": "EU / National / Regional / Municipal",
      "funding_type": "Grant / Subsidized Loan / Tax Credit / Mixed",
      "probability_of_success": "High / Medium / Low",
      "probability_reasoning": "2-3 sentences explaining why this probability",
      "potential_amount_min": <number>,
      "potential_amount_max": <number>,
      "co_financing_pct": <number or null>,
      "application_sequence": "Apply in Phase 1 (immediate) / Phase 2 (after prerequisites) / Phase 3 (later this year)",
      "preparation_weeks": <number>,
      "window_opens": "YYYY-MM-DD or null",
      "window_closes": "YYYY-MM-DD or null",
      "window_status": "Open / Upcoming / Rolling / Check",
      "required_documents": [
        {
          "document": "Document name",
          "description": "Brief description of what's needed",
          "status": "likely_ready / needs_preparation / missing / blocked",
          "effort": "Low / Medium / High",
          "estimated_cost_eur": <number or null>
        }
      ],
      "blockers": [
        {
          "blocker": "Description of the blocking issue",
          "severity": "critical / warning / info",
          "resolution": "How to resolve this",
          "resolution_time": "Estimated time to resolve"
        }
      ],
      "why_apply": "2-3 sentences on why this grant is a strong fit",
      "risks": "1-2 sentences on what could go wrong",
      "official_url": "URL if found",
      "regulation_reference": "Legal reference if found"
    }
  ],
  "blockers_summary": [
    {
      "blocker": "Global blocker description",
      "severity": "critical / warning / info",
      "affects_grants": ["Grant name 1", "Grant name 2"],
      "resolution": "How to resolve",
      "resolution_time": "Estimated time"
    }
  ],
  "action_plan": [
    {
      "phase": "Phase 1: Immediate (next 2 weeks)",
      "actions": [
        {
          "action": "What to do",
          "why": "Why this is urgent",
          "owner": "Who should do this (if determinable from profile)",
          "deadline": "Suggested deadline"
        }
      ]
    }
  ]
}`,
        messages: [{
          role: 'user',
          content: `Analyze this project and build a complete grant application strategy:\n\n${projectContext}`,
        }],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Anthropic API error:', response.status, errText)
      return NextResponse.json({ error: `API error: ${response.status}` }, { status: 502 })
    }

    const data = await response.json()

    // Extract text from response (may have tool_use blocks mixed in)
    const text = data.content
      .filter((item: any) => item.type === 'text')
      .map((item: any) => item.text)
      .join('\n')

    // Parse the JSON response
    let strategy
    try {
      const cleaned = text.replace(/```json|```/g, '').trim()
      // Find the JSON object
      const match = cleaned.match(/\{[\s\S]*\}/)
      if (match) {
        strategy = JSON.parse(match[0])
      } else {
        throw new Error('No JSON object found in response')
      }
    } catch (parseErr: any) {
      console.error('Parse error:', parseErr)
      console.error('Raw text:', text.substring(0, 500))
      return NextResponse.json({ error: 'Failed to parse strategy data. Please try again.' }, { status: 500 })
    }

    // Validate required fields
    if (!strategy.grants_ranked || !Array.isArray(strategy.grants_ranked)) {
      return NextResponse.json({ error: 'Invalid strategy format' }, { status: 500 })
    }

    // Compute summary stats
    const totalValue = strategy.grants_ranked.reduce(
      (sum: number, g: any) => sum + (g.potential_amount_max || g.potential_amount_min || 0), 0
    )
    const highProb = strategy.grants_ranked.filter(
      (g: any) => g.probability_of_success === 'High'
    ).length

    return NextResponse.json({
      ...strategy,
      total_potential_value: totalValue,
      total_grants_analyzed: strategy.grants_ranked.length,
      high_probability_count: highProb,
    })
  } catch (err: any) {
    console.error('Strategy error:', err)
    return NextResponse.json({ error: err.message || 'Strategy generation failed' }, { status: 500 })
  }
}

function buildProjectContext(project: any): string {
  const sections: string[] = []

  sections.push(`PROJECT: ${project.name || 'Unnamed Project'}`)
  sections.push(`COUNTRY: ${project.country || 'Not specified'}`)
  sections.push(`REGION: ${project.region || 'Not specified'}`)
  sections.push(`MUNICIPALITY: ${project.municipality || 'Not specified'}`)

  if (project.summary || project.description) {
    sections.push(`\nDESCRIPTION:\n${project.summary || project.description}`)
  }

  if (project.raw_description) {
    sections.push(`\nDETAILED DESCRIPTION:\n${project.raw_description}`)
  }

  // Entity
  sections.push(`\nENTITY:`)
  sections.push(`Type: ${project.entity_type || 'Not specified'}`)
  sections.push(`Status: ${project.entity_status || 'Not specified'}`)
  sections.push(`Young farmer eligible: ${project.young_farmer_eligible ?? 'Unknown'}`)
  sections.push(`Female farmer eligible: ${project.female_farmer_eligible ?? 'Unknown'}`)
  if (project.ateco_codes) sections.push(`ATECO codes: ${project.ateco_codes}`)

  // Sector
  sections.push(`\nSECTOR:`)
  sections.push(`Primary: ${project.primary_sector || 'Not specified'}`)
  if (project.secondary_sectors?.length) sections.push(`Secondary: ${project.secondary_sectors.join(', ')}`)
  if (project.objectives?.length) sections.push(`Objectives: ${project.objectives.join(', ')}`)

  // Property
  sections.push(`\nPROPERTY:`)
  if (project.heritage_classification) sections.push(`Heritage: ${project.heritage_classification}`)
  if (project.landscape_protections) sections.push(`Landscape protections: ${project.landscape_protections}`)
  if (project.land_area_hectares) sections.push(`Land: ${project.land_area_hectares} hectares`)
  if (project.building_area_sqm) sections.push(`Buildings: ${project.building_area_sqm} sqm`)
  if (project.land_use_types?.length) sections.push(`Land use: ${project.land_use_types.join(', ')}`)

  // Financial
  sections.push(`\nFINANCIAL:`)
  if (project.total_investment_estimate) sections.push(`Total investment: EUR ${project.total_investment_estimate.toLocaleString()}`)
  if (project.own_capital_available) sections.push(`Own capital: EUR ${project.own_capital_available.toLocaleString()}`)
  if (project.co_financing_capacity_pct) sections.push(`Co-financing capacity: ${project.co_financing_capacity_pct}%`)
  if (project.annual_revenue) sections.push(`Annual revenue: EUR ${project.annual_revenue.toLocaleString()}`)
  if (project.funding_range_min || project.funding_range_max) {
    sections.push(`Seeking: EUR ${(project.funding_range_min || 0).toLocaleString()} - ${(project.funding_range_max || 0).toLocaleString()}`)
  }

  // Timeline
  sections.push(`\nTIMELINE:`)
  if (project.project_start_date) sections.push(`Start: ${project.project_start_date}`)
  if (project.expected_completion_date) sections.push(`Completion: ${project.expected_completion_date}`)
  if (project.urgency) sections.push(`Urgency: ${project.urgency}`)

  // Team
  sections.push(`\nTEAM:`)
  if (project.team_size) sections.push(`Size: ${project.team_size}`)
  if (project.key_qualifications) sections.push(`Qualifications: ${project.key_qualifications}`)
  if (project.experience_summary) sections.push(`Experience: ${project.experience_summary}`)

  // Sustainability
  if (project.sustainability_goals) {
    sections.push(`\nSUSTAINABILITY GOALS:\n${project.sustainability_goals}`)
  }

  return sections.join('\n')
}
