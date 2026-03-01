import { validateAuth } from '@/lib/api-auth'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    const authError = await validateAuth(req)
    if (authError) return authError
    const { question, grant, project } = await req.json()
    if (!question || !grant) {
      return NextResponse.json({ error: 'Missing question or grant data' }, { status: 400 })
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
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: `You are a grant funding expert answering specific questions about a grant program. You have access to web search to find current, accurate information.

RULES:
1. Answer the question directly and concisely. Be specific and actionable.
2. Always search the web for current information before answering, especially for deadlines, amounts, eligibility, and application procedures.
3. If you cannot find a definitive answer, say so honestly rather than guessing.
4. Keep answers focused; 2-4 paragraphs maximum.
5. When referencing official regulations, mention the specific regulation name/number.

After answering, you MUST include sources. Respond with ONLY a JSON object, no markdown fences, no preamble:

{
  "answer": "Your detailed answer here. Use plain text, no markdown.",
  "sources": [
    {
      "title": "Page title or description",
      "url": "https://exact-url-you-found",
      "relevance": "One sentence on why this source is relevant"
    }
  ],
  "confidence": "high" | "medium" | "low",
  "follow_up_suggestions": ["suggested follow-up question 1", "suggested follow-up question 2"]
}

Include 1-3 sources. Only include URLs you actually found via web search. Never invent URLs.`,
        messages: [{
          role: 'user',
          content: `GRANT CONTEXT:
Name: ${grant.name}
${grant.name_it ? `Italian name: ${grant.name_it}` : ''}
Funding source: ${grant.funding_source || 'Unknown'}
Type: ${grant.funding_type || 'Grant'}
Max amount: ${grant.max_amount ? '€' + Number(grant.max_amount).toLocaleString() : 'Unknown'}
Min amount: ${grant.min_amount ? '€' + Number(grant.min_amount).toLocaleString() : 'Unknown'}
Deadline: ${grant.application_window_closes || 'Unknown'}
Window: ${grant.window_status || 'Unknown'}
Eligibility: ${grant.eligibility_summary || 'Not specified'}
Description: ${grant.description || 'N/A'}
${grant.regulation_reference ? `Regulation: ${grant.regulation_reference}` : ''}
${grant.official_url ? `Official URL: ${grant.official_url}` : ''}

${project ? `PROJECT CONTEXT:
Project: ${project.name || 'Agricultural estate conversion'}
Location: ${project.municipality || 'San Casciano dei Bagni'}, ${project.region || 'Tuscany'}, Italy
Sector: ${project.primary_sector || 'Agriculture/Hospitality'}
Heritage: ${project.heritage_classification || 'BSA'}
Young farmer eligible: ${project.young_farmer_eligible ? 'Yes' : 'Unknown'}` : ''}

USER QUESTION: ${question}

Today's date: ${new Date().toISOString().split('T')[0]}

Search the web for the most current and accurate information to answer this question. Focus on official Italian government sources, EU databases, and authoritative grant information sites.`,
        }],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('QA API error:', response.status, errText)
      return NextResponse.json({ error: `API error: ${response.status}` }, { status: 502 })
    }

    const data = await response.json()

    // Extract text from all content blocks (handle web_search tool use pattern)
    const textParts = data.content
      .filter((item: any) => item.type === 'text')
      .map((item: any) => item.text)
    const allText = textParts.join('\n')

    // Parse JSON response
    let result = null
    try {
      const cleaned = allText.replace(/```json|```/g, '').trim()
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0])
      }
    } catch {
      // JSON parse failed, use raw text as answer
    }

    if (result && result.answer) {
      return NextResponse.json(result)
    }

    // Fallback: if JSON parsing fails, return the raw text as the answer
    if (allText.trim()) {
      return NextResponse.json({
        answer: allText.trim(),
        sources: [],
        confidence: 'medium',
        follow_up_suggestions: [],
      })
    }

    return NextResponse.json({ error: 'No answer generated' }, { status: 500 })
  } catch (err: any) {
    console.error('Grant QA error:', err)
    return NextResponse.json({ error: err.message || 'Question failed' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/grant-qa',
    method: 'POST { question, grant, project? }',
  })
}
