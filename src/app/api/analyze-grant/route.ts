import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { grant, project } = await req.json()
    if (!grant || !project) {
      return NextResponse.json({ error: 'Missing grant or project data' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: `You are a grant advisory specialist. Analyze how a specific grant matches a specific project. Be concrete, specific, and actionable. Write in a warm, professional tone as if advising a founder directly.

Respond with ONLY a JSON object (no markdown, no backticks). The object must have exactly these fields:
{
  "who_is_it_for": "2-3 sentences describing the ideal applicant profile for this grant",
  "why_relevant": "3-5 sentences explaining exactly why this grant is a strong match for THIS specific project. Reference specific project attributes that align with grant criteria.",
  "risks": "2-4 sentences about potential challenges, disqualifiers, or things to watch out for when applying. Be honest and specific."
}`,
        messages: [{
          role: 'user',
          content: `Analyze this grant for this project:

GRANT:
Name: ${grant.name}
Description: ${grant.description || 'Not available'}
Eligibility: ${grant.eligibility_summary || 'Not specified'}
Funding source: ${grant.funding_source}
Type: ${grant.funding_type}
Amount: EUR ${grant.min_amount || '?'} - ${grant.max_amount || '?'}
Requires young farmer: ${grant.requires_young_farmer}
Requires agricultural entity: ${grant.requires_agricultural_entity}
Requires BSA heritage: ${grant.requires_bsa_heritage}

PROJECT:
Name: ${project.name}
Summary: ${project.summary || project.description}
Location: ${project.municipality}, ${project.region}, ${project.country}
Entity: ${project.entity_type} (${project.entity_status})
Young farmer eligible: ${project.young_farmer_eligible}
Heritage: ${project.heritage_classification || 'None'}
Sectors: ${[project.primary_sector, ...(project.secondary_sectors || [])].filter(Boolean).join(', ')}
Objectives: ${(project.objectives || []).join(', ')}
Investment: EUR ${project.total_investment_estimate?.toLocaleString() || '?'}
Land: ${project.land_area_hectares} hectares
Buildings: ${project.building_area_sqm} sqm`,
        }],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Anthropic API error:', response.status, errText)
      return NextResponse.json({ error: `API error: ${response.status}` }, { status: 502 })
    }

    const data = await response.json()
    const text = data.content
      .filter((item: any) => item.type === 'text')
      .map((item: any) => item.text)
      .join('\n')

    const cleaned = text.replace(/```json|```/g, '').trim()
    const analysis = JSON.parse(cleaned)

    return NextResponse.json(analysis)
  } catch (err: any) {
    console.error('Analysis error:', err)
    return NextResponse.json({ error: err.message || 'Analysis failed' }, { status: 500 })
  }
}
