import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 120 // Allow up to 2 minutes for AI research

export async function POST(req: NextRequest) {
  try {
    const { project } = await req.json()

    if (!project) {
      return NextResponse.json({ error: 'No project data provided' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
    }

    const sectors = [project.primary_sector, ...(project.secondary_sectors || [])].filter(Boolean).join(', ')
    const objectives = (project.objectives || []).join(', ')
    const landUse = (project.land_use_types || []).join(', ')

    const systemPrompt = `You are an expert EU and Italian grant research specialist. Your job is to find ALL available grants, funds, subsidized loans, tax credits, and financial incentives that a project might qualify for.

You MUST use web search to find current, real grant programs. Search multiple times to be thorough. Focus on:
1. EU structural and investment funds (ERDF, ESF+, EAFRD, EMFAF)
2. Italian national programs (PNRR, PSR, Fondo Perduto programs)
3. Tuscan regional programs (Regione Toscana bandi)
4. Agricultural and agritourism-specific funding
5. Heritage and cultural preservation funds
6. Young farmer (giovane agricoltore) incentives
7. Energy efficiency and sustainability grants
8. Rural development and tourism programs
9. Tax credits (Superbonus, Sismabonus, Bonus Ristrutturazioni, credito d'imposta)

For each grant found, assess relevance to the specific project described.

CRITICAL: Respond with ONLY a JSON array. No markdown, no backticks, no preamble. Just the raw JSON array.

Each object in the array must have exactly these fields:
{
  "name": "English name of the grant/fund",
  "name_it": "Italian name if applicable, otherwise null",
  "funding_source": "EU" | "National" | "Regional" | "Local" | "Mixed",
  "funding_type": "Grant" | "Subsidized Loan" | "Tax Credit" | "Mixed" | "Guarantee",
  "description": "2-3 sentence description of what the fund covers",
  "eligibility_summary": "Key eligibility criteria",
  "min_amount": number or null (in EUR),
  "max_amount": number or null (in EUR),
  "co_financing_pct": number or null (percentage the applicant must co-finance),
  "application_window_opens": "YYYY-MM-DD" or null,
  "application_window_closes": "YYYY-MM-DD" or null,
  "window_status": "Open" | "Closing soon" | "Rolling" | "Not yet open" | "Unknown",
  "official_url": "URL to official program page" or null,
  "regulation_reference": "Legal reference" or null,
  "relevance_score": 0-100 (percentage match to the project profile. 90-100 = near-perfect fit, 70-89 = strong fit, 50-69 = moderate fit, 30-49 = weak fit, below 30 = poor fit),
  "effort_level": "Low" | "Medium" | "High" | "Very High",
  "requires_young_farmer": boolean,
  "requires_agricultural_entity": boolean,
  "requires_bsa_heritage": boolean,
  "notes": "Any important notes about this specific opportunity for this project" or null
}

Find at least 15 grants. Be thorough. Include both obvious and less-known opportunities. Sort by relevance_score descending (highest match first).`

    const userPrompt = `Find all available grants and funding for this project:

PROJECT: ${project.name}
SUMMARY: ${project.summary || project.description || 'Agricultural estate conversion to hospitality'}
LOCATION: ${project.municipality || ''}, ${project.region || ''}, ${project.country || 'Italy'}

ENTITY: ${project.entity_type || 'Agricultural company'}
STATUS: ${project.entity_status || 'To be established'}
YOUNG FARMER ELIGIBLE: ${project.young_farmer_eligible ? 'Yes (applicant under 40)' : 'No'}

SECTORS: ${sectors || 'Hospitality, Agritourism, Agriculture'}
OBJECTIVES: ${objectives || 'Building renovation, agritourism, agriculture'}

PROPERTY:
- Heritage: ${project.heritage_classification || 'None specified'}
- Protections: ${project.landscape_protections || 'None specified'}
- Land: ${project.land_area_hectares || '?'} hectares (${landUse || 'mixed agricultural'})
- Buildings: ${project.building_area_sqm || '?'} sqm

FINANCIAL:
- Total investment: EUR ${project.total_investment_estimate?.toLocaleString() || 'not specified'}
- Own capital: EUR ${project.own_capital_available?.toLocaleString() || 'not specified'}
- Co-financing capacity: ${project.co_financing_capacity_pct || '?'}%
- Seeking: EUR ${project.funding_range_min?.toLocaleString() || '?'} - ${project.funding_range_max?.toLocaleString() || '?'}

TIMELINE: ${project.project_start_date || '2026'} to ${project.expected_completion_date || '2028'}
URGENCY: ${project.urgency || 'High'}

ATECO CODES: ${project.ateco_codes || 'Not specified'}

Search the web thoroughly for all grants, funds, subsidized loans, and tax credits this project could qualify for. Include EU, national Italian, and Tuscan regional programs. Today's date is ${new Date().toISOString().split('T')[0]}.`

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
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Anthropic API error:', response.status, errText)
      return NextResponse.json({ error: `API error: ${response.status}` }, { status: 502 })
    }

    const data = await response.json()

    // Extract text content
    const textBlocks = data.content
      .filter((item: any) => item.type === 'text')
      .map((item: any) => item.text)
      .join('\n')

    // Parse JSON
    let grants = []
    try {
      const cleaned = textBlocks.replace(/```json|```/g, '').trim()
      const arrayMatch = cleaned.match(/\[[\s\S]*\]/)
      if (arrayMatch) {
        grants = JSON.parse(arrayMatch[0])
      } else {
        throw new Error('No JSON array found')
      }
    } catch (parseErr) {
      console.error('Parse error:', parseErr, 'Raw:', textBlocks.substring(0, 500))
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 })
    }

    return NextResponse.json({ grants })
  } catch (err: any) {
    console.error('Discovery error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
