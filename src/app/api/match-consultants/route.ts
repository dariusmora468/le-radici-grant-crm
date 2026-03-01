import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { grant } = await req.json()
    if (!grant) {
      return NextResponse.json({ error: 'Missing grant data' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
    }

    // Fetch existing consultants from database
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const consultantsRes = await fetch(`${supabaseUrl}/rest/v1/consultants?select=*`, {
      headers: { apikey: supabaseKey!, Authorization: `Bearer ${supabaseKey}` },
    })
    const existingConsultants = await consultantsRes.json()

    // Fetch project profile
    const projectRes = await fetch(`${supabaseUrl}/rest/v1/projects?select=*&limit=1`, {
      headers: { apikey: supabaseKey!, Authorization: `Bearer ${supabaseKey}` },
    })
    const projects = await projectRes.json()
    const project = projects?.[0] || {}

    const systemPrompt = `You are an expert at matching grant application consultants with specific funding opportunities. You will be given:
1. Details about a specific grant
2. A project profile
3. Any existing consultants already in the system

Your job is to return a ranked list of consultants who could help with THIS specific grant application. Include:
- Existing consultants from the database (score them based on relevance)
- New consultant recommendations you know of that specialize in this type of grant (Italian/EU agricultural, heritage, hospitality, or young farmer grants)

For each consultant, provide a match_score from 1 to 100:
- 90-100: Perfect specialist for exactly this grant type and region
- 70-89: Strong match, relevant expertise
- 50-69: Moderate match, general expertise applies
- 30-49: Weak match, tangentially related
- Below 30: Not very relevant

CRITICAL: Respond with ONLY a JSON array. No markdown, no backticks, no preamble.
Each object must have:
{
  "name": "Full name",
  "organization": "Company or firm name",
  "specialization": "Specific focus area (e.g., 'EU agricultural grants, Tuscany region')",
  "region": "Geographic area they cover",
  "email": "email if known, or null",
  "phone": "phone if known, or null",
  "website": "website if known, or null",
  "match_score": 85,
  "match_reasoning": "1-2 sentences explaining why they're a good match for this specific grant",
  "is_existing": true/false
}

Return 5-10 consultants, sorted by match_score descending. For existing consultants, use their actual data and add the match score. For new recommendations, provide as much real contact info as you can.`

    const userPrompt = `GRANT: ${grant.name}${grant.name_it ? ` (${grant.name_it})` : ''}
Funding source: ${grant.funding_source}
Description: ${grant.description || 'N/A'}
Eligibility: ${grant.eligibility_summary || 'N/A'}
Max amount: ${grant.max_amount ? `€${grant.max_amount.toLocaleString()}` : 'Not specified'}

PROJECT: ${project.name || 'Agricultural estate conversion in Tuscany'}
Location: ${project.municipality || 'San Casciano dei Bagni'}, ${project.region || 'Tuscany'}, Italy
Sector: ${project.primary_sector || 'Agriculture/Hospitality'}
Heritage: ${project.heritage_classification || 'BSA - Bene Storico Architettonico'}
Young farmer eligible: ${project.young_farmer_eligible ? 'Yes' : 'No'}

EXISTING CONSULTANTS IN DATABASE:
${existingConsultants && existingConsultants.length > 0
  ? existingConsultants.map((c: any) => `- ${c.name}${c.organization ? ` (${c.organization})` : ''}: ${c.specialization || 'General'}, ${c.region || 'N/A'}`).join('\n')
  : 'None yet'}

Return the ranked consultant list.`

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
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!response.ok) {
      return NextResponse.json({ error: `AI API error: ${response.status}` }, { status: 500 })
    }

    const data = await response.json()
    const text = data.content?.[0]?.text || ''

    let consultants
    try {
      const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      consultants = JSON.parse(cleaned)
    } catch {
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 })
    }

    if (!Array.isArray(consultants)) {
      return NextResponse.json({ error: 'AI returned invalid format' }, { status: 500 })
    }

    return NextResponse.json(consultants)
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 })
  }
}

export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  return NextResponse.json({
    status: 'ok',
    api_key_set: !!apiKey,
    endpoint: '/api/match-consultants',
  })
}
