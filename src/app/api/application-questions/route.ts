import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { section_type, section_id, grant, existing_answers } = await req.json()
    if (!section_type || !section_id || !grant) {
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

    const batchNumber = existing_answers?.length > 0
      ? Math.ceil(existing_answers.length / 4) + 1
      : 1

    const sectionPrompts: Record<string, string> = {
      proposal: `You are helping prepare a grant proposal narrative. Generate 3-4 targeted questions that will help extract the information needed to write a compelling proposal for this specific grant.

Focus on what grant evaluators typically score:
- Project objectives and expected outcomes
- Methodology and implementation plan
- Innovation and unique value
- Sustainability and long-term impact
- Team qualifications and capacity
- Alignment with the grant's stated priorities

Tailor questions specifically to THIS grant's focus areas and evaluation criteria.`,

      budget: `You are helping prepare a budget plan for a grant application. Generate 3-4 questions about the applicant's financial planning and cost structure.

Focus on:
- Major cost categories (construction, equipment, personnel, professional services)
- Co-financing capacity and sources
- Timeline of expenditures
- Cost justification and market rates
- In-kind contributions`,

      documents: `You are helping identify required documents for a grant application. Generate 3-4 questions about the applicant's document readiness.

Focus on:
- Corporate/entity documentation status
- Financial statements and tax clearances
- Property and land documentation
- Professional certifications and qualifications
- Environmental and building permits`,
    }

    const systemPrompt = `${sectionPrompts[section_type] || sectionPrompts.proposal}

${existing_answers && existing_answers.length > 0 ? `
The applicant has already answered these questions. DO NOT repeat them. Ask follow-up or deeper questions based on their answers:
${existing_answers.map((a: any) => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n')}
` : ''}

CRITICAL: Respond with ONLY a JSON array. No markdown, no backticks, no preamble.
Each object must have:
{
  "question": "Clear, specific question",
  "guidance": "Brief hint or example of what a good answer looks like (1-2 sentences)"
}

Generate exactly 3-4 questions. Make them specific to this grant and project, not generic.`

    const userPrompt = `Grant: ${grant.name}${grant.name_it ? ` (${grant.name_it})` : ''}
Funding source: ${grant.funding_source}
Description: ${grant.description || 'Not available'}
Eligibility: ${grant.eligibility_summary || 'Not specified'}
Max amount: ${grant.max_amount ? `€${grant.max_amount.toLocaleString()}` : 'Not specified'}

Project: ${project.name || 'Agricultural estate conversion'}
Location: ${project.municipality || ''}, ${project.region || ''}, ${project.country || 'Italy'}
Summary: ${project.summary || project.description || project.raw_description || ''}
Entity type: ${project.entity_type || 'Not specified'}
Primary sector: ${project.primary_sector || 'Agriculture/Hospitality'}
Young farmer eligible: ${project.young_farmer_eligible ? 'Yes' : 'No'}
Heritage classification: ${project.heritage_classification || 'None specified'}

Generate the next batch of questions.`

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
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      return NextResponse.json({ error: `AI API error: ${response.status}` }, { status: 500 })
    }

    const data = await response.json()
    const text = data.content?.[0]?.text || ''

    let questions
    try {
      const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      questions = JSON.parse(cleaned)
    } catch {
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 })
    }

    if (!Array.isArray(questions)) {
      return NextResponse.json({ error: 'AI returned invalid format' }, { status: 500 })
    }

    // Save questions to database
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(supabaseUrl!, supabaseKey!)

    const questionsToInsert = questions.map((q: any, i: number) => ({
      section_id,
      question: q.question,
      guidance: q.guidance || null,
      order_index: (existing_answers?.length || 0) + i,
      batch_number: batchNumber,
    }))

    const { error: insertError } = await supabase.from('application_questions').insert(questionsToInsert)
    if (insertError) {
      return NextResponse.json({ error: `Database error: ${insertError.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true, count: questions.length, batch: batchNumber })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 })
  }
}

export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  return NextResponse.json({
    status: 'ok',
    api_key_set: !!apiKey,
    endpoint: '/api/application-questions',
  })
}
