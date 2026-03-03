import { validateAuth } from '@/lib/api-auth'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    const authError = await validateAuth(req)
    if (authError) return authError

    const { grant, project } = await req.json()
    if (!grant) {
      return NextResponse.json({ error: 'Missing grant data' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
    }

    const grantLines = [
      `Grant name: ${grant.name}`,
      grant.name_it ? `Italian name: ${grant.name_it}` : null,
      `Funding source: ${grant.funding_source}`,
      `Funding type: ${grant.funding_type || 'Grant'}`,
      grant.description ? `Description: ${grant.description}` : null,
      grant.eligibility_summary ? `Eligibility: ${grant.eligibility_summary}` : null,
      grant.max_amount ? `Max amount: EUR ${Number(grant.max_amount).toLocaleString()}` : null,
    ].filter(Boolean).join('\n')

    const projectLines = project ? [
      `Project: ${project.name || 'Agricultural estate in Tuscany'}`,
      `Location: ${project.municipality || 'Tuscany'}, Italy`,
      `Sector: ${project.primary_sector || 'Agriculture/Hospitality'}`,
      project.heritage_classification ? `Heritage: ${project.heritage_classification}` : null,
    ].filter(Boolean).join('\n') : ''

    const systemPrompt = `You are an expert at finding Italian and European grant consultants and advisory firms. Your job is to find REAL, verifiable consultants and consulting firms who specialize in helping clients apply for specific grants.

Use web search to find real consulting firms and freelance grant consultants who:
1. Specialize in the specific grant program or funding type mentioned
2. Work in Italy (especially Tuscany / central Italy for regional grants)
3. Have a public website with verifiable contact information
4. Have experience with agricultural, agritourism, cultural heritage, or hospitality sectors

CRITICAL RULES:
- Only include consultants where you can confirm their website resolves to a real firm
- Only include email addresses that are explicitly shown on their website
- Only include phone numbers that appear on their website or official profile
- NEVER invent or guess contact details — if not found, set to null
- Find at least 3 and up to 5 consultants
- Prioritize specialists over generalists; prefer Tuscany/Italy-based firms

Respond with ONLY a JSON array (no markdown, no backticks):
[
  {
    "name": "Full name or firm name",
    "organization": "Parent company or firm name (null if same as name)",
    "specialization": "Their specific expertise relevant to this grant (1 sentence)",
    "region": "Geographic coverage (e.g., Tuscany, Italy, EU-wide)",
    "website": "https://... — REQUIRED, must be a real working URL",
    "email": "contact email or null if not explicitly found",
    "phone": "+39... or null if not explicitly found",
    "match_score": 0-100,
    "match_reasoning": "Why this consultant is ideal for this specific grant (1-2 sentences)",
    "notes": "Any relevant track record, certifications, or focus areas, or null"
  }
]`

    const userPrompt = `Find the top 5 most relevant grant consultants or advisory firms for this specific funding program:

=== GRANT ===
${grantLines}

=== PROJECT ===
${projectLines}

Search specifically for:
1. Consultants who have worked with ${grant.name}${grant.name_it ? ` / ${grant.name_it}` : ''} applications
2. Italian "consulenti bandi" specializing in ${grant.funding_source === 'EU' ? 'fondi europei (EAFRD, LIFE, Creative Europe, etc.)' : grant.funding_source === 'National' ? 'fondi nazionali PNRR, ISMEA, Invitalia' : 'fondi regionali toscana PSR'}
3. Consulting firms with agricultural, agritourism, or cultural heritage grant experience in Italy
4. Any associations or networks of grant consultants in Tuscany

Return the top 5 with full contact details from their websites. Today is ${new Date().toISOString().split('T')[0]}.`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
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

    const textBlocks = data.content
      .filter((item: any) => item.type === 'text')
      .map((item: any) => item.text)
      .join('\n')

    let consultants: any[] = []
    try {
      const cleaned = textBlocks.replace(/```json|```/g, '').trim()
      const arrayMatch = cleaned.match(/\[[\s\S]*\]/)
      if (arrayMatch) {
        const parsed = JSON.parse(arrayMatch[0])
        if (Array.isArray(parsed)) {
          consultants = parsed.filter((c: any) => c.website && c.website.startsWith('http'))
        }
      }
    } catch (parseErr) {
      console.error('Parse error:', parseErr, 'Raw:', textBlocks.substring(0, 500))
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 })
    }

    return NextResponse.json({
      consultants: consultants.slice(0, 5),
      stats: { total: consultants.length },
    })
  } catch (err: any) {
    console.error('Match consultants error:', err)
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/match-consultants',
    description: 'Uses Claude web_search to find real Italian grant consultants for a specific grant program',
  })
}
