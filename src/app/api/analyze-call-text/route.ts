import { validateAuth } from '@/lib/api-auth'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const authError = await validateAuth(req)
    if (authError) return authError

    const { grant_id, call_text } = await req.json()
    if (!grant_id || !call_text) {
      return NextResponse.json({ error: 'Missing grant_id or call_text' }, { status: 400 })
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
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system: `You are an expert grant strategist who helps applicants understand what reviewers are really looking for.
Analyze the provided call for proposals text and extract the strategic intelligence needed to win.

Focus on:
- The exact institutional vocabulary and phrases reviewers expect to see
- The scoring criteria and evaluation rubric (explicit or implied)
- What the funding body really wants to achieve (their hidden agenda)
- Common reasons applications get rejected

Respond with ONLY a JSON object (no markdown, no backticks, no explanation). Structure:
{
  "keywords": ["word or phrase 1", "word or phrase 2", ...],
  "scoring_criteria": [
    {"criterion": "criterion name", "weight": "High|Medium|Low", "notes": "what reviewers look for here"},
    ...
  ],
  "what_they_want": "2-3 sentences describing the real objective of this grant and what a winning application looks like",
  "red_flags": ["disqualifier or common mistake 1", "disqualifier or common mistake 2", ...]
}

Keywords should be 8-15 specific institutional terms/phrases from the text that should appear in your application.
Scoring criteria should list 3-6 evaluation dimensions with their relative importance.
Red flags should list 2-5 common disqualifiers or mistakes.`,
        messages: [{
          role: 'user',
          content: `Analyze this call for proposals and extract the strategic scoring intelligence:\n\n${call_text.slice(0, 8000)}`,
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

    // Save to the grants table
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    await supabase
      .from('grants')
      .update({ scoring_criteria: analysis })
      .eq('id', grant_id)

    return NextResponse.json({ scoring_criteria: analysis })
  } catch (err: any) {
    console.error('Call text analysis error:', err)
    return NextResponse.json({ error: err.message || 'Analysis failed' }, { status: 500 })
  }
}
