import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    const { section_type, section_id, grant, answers } = await req.json()
    if (!section_id || !grant || !answers || answers.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
    }

    // Fetch project profile
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const projectRes = await fetch(`${supabaseUrl}/rest/v1/projects?select=*&limit=1`, {
      headers: { apikey: supabaseKey!, Authorization: `Bearer ${supabaseKey}` },
    })
    const projects = await projectRes.json()
    const project = projects?.[0] || {}

    const systemPrompt = `You are an expert grant writer who has helped hundreds of projects secure EU and Italian government funding. Write a compelling grant proposal narrative based on the applicant's answers to guided questions.

WRITING GUIDELINES:
- Write in a formal but persuasive tone appropriate for grant evaluators
- Structure the narrative with clear sections and headings
- Emphasize alignment between the project and the grant's stated objectives
- Quantify impacts wherever possible (jobs created, revenue projections, heritage preserved)
- Highlight unique qualifications (young farmer status, heritage site, agricultural innovation)
- Address potential weaknesses proactively
- Keep it concise but thorough (aim for 1500-2500 words)
- Use the language appropriate for the grant (Italian grants should be in Italian, EU grants in English)

STRUCTURE:
1. Executive Summary (2-3 paragraphs)
2. Project Description and Objectives
3. Methodology and Implementation Plan
4. Expected Outcomes and Impact
5. Sustainability and Long-term Vision
6. Team Qualifications
7. Budget Justification Summary

Write the complete draft narrative now.`

    const answersFormatted = answers.map((a: any) => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n')

    const userPrompt = `GRANT: ${grant.name}${grant.name_it ? ` (${grant.name_it})` : ''}
Funding source: ${grant.funding_source}
Max amount: ${grant.max_amount ? `€${grant.max_amount.toLocaleString()}` : 'Not specified'}
Description: ${grant.description || 'N/A'}
Eligibility: ${grant.eligibility_summary || 'N/A'}

PROJECT: ${project.name || 'Agricultural estate conversion'}
Location: ${project.municipality || ''}, ${project.region || ''}, ${project.country || 'Italy'}
Summary: ${project.summary || project.raw_description || ''}
Sector: ${project.primary_sector || 'Agriculture/Hospitality'}
Heritage: ${project.heritage_classification || 'None'}
Young farmer: ${project.young_farmer_eligible ? 'Yes' : 'No'}
Investment estimate: ${project.total_investment_estimate ? `€${project.total_investment_estimate.toLocaleString()}` : 'Not specified'}

APPLICANT'S ANSWERS:
${answersFormatted}

Write the complete proposal narrative based on these answers.`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
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

    if (!response.ok) {
      return NextResponse.json({ error: `AI API error: ${response.status}` }, { status: 500 })
    }

    const data = await response.json()
    const draft = data.content?.[0]?.text || ''

    if (!draft) {
      return NextResponse.json({ error: 'AI returned empty response' }, { status: 500 })
    }

    return NextResponse.json({ success: true, draft })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 })
  }
}

export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  return NextResponse.json({
    status: 'ok',
    api_key_set: !!apiKey,
    endpoint: '/api/application-draft',
  })
}
