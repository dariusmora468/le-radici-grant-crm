import { validateAuth } from '@/lib/api-auth'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    const authError = await validateAuth(req)
    if (authError) return authError
    const { grant, project } = await req.json()
    if (!grant || !project) {
      return NextResponse.json({ error: 'Missing data' }, { status: 400 })
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
        max_tokens: 4000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: `You are a consultant sourcing specialist. Find real consultants, consulting firms, and professionals who help with grant applications in a specific region and sector.

Search the web to find actual firms and professionals. Focus on:
1. Grant application consultants (consulenti bandi/finanziamenti) in the specific region
2. Agricultural/agritourism grant specialists
3. EU funding consultants active in Italy
4. Heritage/cultural project funding specialists
5. CAF and patronato offices that handle agricultural grants
6. Commercialisti who specialize in agricultural subsidies

CRITICAL: Respond with ONLY a JSON array. No markdown, no backticks, no preamble.

Each object must have:
{
  "name": "Full name or firm name",
  "organization": "Company/firm name if different from name, otherwise null",
  "specialization": "Brief description of what they do (max 15 words)",
  "region": "Where they operate",
  "email": "Email if found, otherwise null",
  "phone": "Phone if found, otherwise null",
  "website": "Website URL if found, otherwise null",
  "notes": "One sentence about why they are relevant for this specific grant"
}

Find at least 8 consultants. Only include real firms/people you find via web search.`,
        messages: [{
          role: 'user',
          content: `Find consultants who can help with this grant application:

GRANT: ${grant.name}
TYPE: ${grant.funding_source} - ${grant.funding_type}
DESCRIPTION: ${grant.description || 'N/A'}

PROJECT LOCATION: ${project.municipality || ''}, ${project.region || ''}, ${project.country || 'Italy'}
PROJECT SECTOR: ${project.primary_sector || 'Agritourism'}

Search for real consulting firms, professionals, and organizations in ${project.region || 'Tuscany'}, Italy that specialize in ${grant.funding_source || 'EU'} grants, agricultural funding, and ${grant.funding_type || 'grant'} applications. Today's date is ${new Date().toISOString().split('T')[0]}.`,
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

    let consultants = []
    try {
      const cleaned = text.replace(/```json|```/g, '').trim()
      const match = cleaned.match(/\[[\s\S]*\]/)
      if (match) {
        consultants = JSON.parse(match[0])
      } else {
        throw new Error('No JSON array found')
      }
    } catch (parseErr) {
      console.error('Parse error:', parseErr)
      return NextResponse.json({ error: 'Failed to parse consultant data' }, { status: 500 })
    }

    return NextResponse.json({ consultants })
  } catch (err: any) {
    console.error('Consultant search error:', err)
    return NextResponse.json({ error: err.message || 'Search failed' }, { status: 500 })
  }
}
