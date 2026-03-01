import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 120

// Verify a URL actually resolves
async function verifyUrl(url: string): Promise<boolean> {
  if (!url) return false
  try {
    const fullUrl = url.startsWith('http') ? url : `https://${url}`
    const res = await fetch(fullUrl, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
    })
    return res.ok || res.status === 301 || res.status === 302 || res.status === 403
  } catch {
    return false
  }
}

// Verify email domain has MX records (via DNS-over-HTTPS)
async function verifyEmailDomain(email: string): Promise<boolean> {
  if (!email || !email.includes('@')) return false
  try {
    const domain = email.split('@')[1]
    const res = await fetch(`https://dns.google/resolve?name=${domain}&type=MX`, {
      signal: AbortSignal.timeout(3000),
    })
    const data = await res.json()
    return data.Answer && data.Answer.length > 0
  } catch {
    return false
  }
}

// Fetch a webpage and extract text for AI analysis
async function fetchPageText(url: string): Promise<string | null> {
  try {
    const fullUrl = url.startsWith('http') ? url : `https://${url}`
    const res = await fetch(fullUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GrantFlow/1.0)' },
    })
    if (!res.ok) return null
    const html = await res.text()
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return text.substring(0, 3000)
  } catch {
    return null
  }
}

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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    // Fetch existing consultants
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

    const grantContext = `Grant: ${grant.name}${grant.name_it ? ` (${grant.name_it})` : ''}
Funding source: ${grant.funding_source}
Description: ${grant.description || 'N/A'}
Eligibility: ${grant.eligibility_summary || 'N/A'}
Max amount: ${grant.max_amount ? '€' + grant.max_amount.toLocaleString() : 'N/A'}

Project: ${project.name || 'Agricultural estate conversion in Tuscany'}
Location: ${project.municipality || 'San Casciano dei Bagni'}, ${project.region || 'Tuscany'}, Italy
Sector: ${project.primary_sector || 'Agriculture/Hospitality'}
Heritage: ${project.heritage_classification || 'BSA'}
Young farmer: ${project.young_farmer_eligible ? 'Yes' : 'No'}`

    const results: any[] = []

    // ============================================
    // PHASE 1: Score existing database consultants
    // ============================================
    if (existingConsultants && existingConsultants.length > 0) {
      const scorePrompt = `Score existing consultants for relevance to a specific grant application.

${grantContext}

EXISTING CONSULTANTS:
${existingConsultants.map((c: any, i: number) => `[${i}] ${c.name}${c.organization ? ` (${c.organization})` : ''} - Specialization: ${c.specialization || 'General'} - Region: ${c.region || 'N/A'}`).join('\n')}

Score each 0-100. 90-100: perfect specialist. 70-89: strong. 50-69: moderate. 30-49: weak. Below 30: not relevant.

Respond ONLY with a JSON array: [{ "index": 0, "match_score": 85, "match_reasoning": "why" }]`

      const scoreRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          messages: [{ role: 'user', content: scorePrompt }],
        }),
      })

      if (scoreRes.ok) {
        const scoreData = await scoreRes.json()
        const scoreText = scoreData.content?.[0]?.text || ''
        try {
          const scores = JSON.parse(scoreText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim())
          if (Array.isArray(scores)) {
            for (const score of scores) {
              const c = existingConsultants[score.index]
              if (c) {
                results.push({
                  ...c,
                  match_score: score.match_score,
                  match_reasoning: score.match_reasoning,
                  is_existing: true,
                  is_verified: true,
                  verification: { source: 'database', website_verified: null, email_verified: null },
                })
              }
            }
          }
        } catch { /* scoring failed, skip */ }
      }
    }

    // ============================================
    // PHASE 2: Generate search queries for real firms
    // ============================================
    const searchPrompt = `Generate 3 specific Google search queries in Italian to find REAL consulting firms that help with this type of grant in Italy/Tuscany.

${grantContext}

Respond ONLY with a JSON array of 3 strings. No markdown.
Example: ["consulente bandi agricoli toscana", "studio consulenza fondi europei agricoltura", "consulente ISMEA finanziamenti"]`

    let searchQueries: string[] = []
    const searchRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{ role: 'user', content: searchPrompt }],
      }),
    })

    if (searchRes.ok) {
      const searchData = await searchRes.json()
      const searchText = searchData.content?.[0]?.text || ''
      try {
        searchQueries = JSON.parse(searchText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim())
      } catch { /* fallback below */ }
    }

    if (!Array.isArray(searchQueries) || searchQueries.length === 0) {
      searchQueries = [
        `consulente bandi ${grant.funding_source === 'EU' ? 'europei' : 'agricoli'} toscana`,
        `studio consulenza finanziamenti agevolati agricoltura italia`,
      ]
    }

    // ============================================
    // PHASE 3: Web search and fetch real sites
    // ============================================
    const discoveredSites: Map<string, { url: string; pageText: string }> = new Map()

    for (const query of searchQueries.slice(0, 3)) {
      try {
        const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=5&hl=it`
        const gRes = await fetch(googleUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
          signal: AbortSignal.timeout(8000),
        })
        if (gRes.ok) {
          const html = await gRes.text()
          // Extract URLs from search results
          const urlMatches = html.match(/https?:\/\/[^\s"<>&]+/g) || []
          const cleanUrls = urlMatches
            .filter(u =>
              !u.includes('google.') &&
              !u.includes('gstatic.') &&
              !u.includes('googleapis.') &&
              !u.includes('youtube.') &&
              !u.includes('wikipedia.') &&
              !u.includes('facebook.') &&
              !u.includes('linkedin.') &&
              !u.includes('twitter.') &&
              !u.includes('instagram.') &&
              !u.includes('amazon.') &&
              u.match(/\.(it|eu|com|org|net)/)
            )
            .map(u => { try { return new URL(u).origin } catch { return null } })
            .filter(Boolean) as string[]

          for (const url of Array.from(new Set(cleanUrls)).slice(0, 3)) {
            if (!discoveredSites.has(url) && discoveredSites.size < 8) {
              const pageText = await fetchPageText(url)
              if (pageText && pageText.length > 200) {
                discoveredSites.set(url, { url, pageText })
              }
            }
          }
        }
      } catch { /* continue to next query */ }
    }

    // ============================================
    // PHASE 4: Extract info from real sites + verify
    // ============================================
    if (discoveredSites.size > 0) {
      const siteEntries = Array.from(discoveredSites.entries()).slice(0, 6)
      const extractPrompt = `Extract REAL consultant/firm info from actual website content. ONLY extract what is EXPLICITLY written on the page. NEVER invent details.

${grantContext}

${siteEntries.map(([url, data], i) => `--- SITE ${i + 1}: ${url} ---\n${data.pageText.substring(0, 1500)}\n`).join('\n')}

For each RELEVANT consulting firm found, extract ONLY what the page explicitly shows:
- name: Firm name as shown on site
- organization: Same or parent org
- specialization: Their stated focus (only what they claim)
- region: Where they operate (only if stated)
- email: ONLY if an email appears on the page text. If not visible, use null
- phone: ONLY if a phone number appears. If not, use null
- website: The URL provided above
- match_score: 0-100 relevance to this grant
- match_reasoning: 1-2 sentences

RULES:
- If a field is NOT on the page, set to null
- NEVER invent emails, phones, or names
- Skip sites that aren't consulting/advisory firms
- Return JSON array only. Empty array [] if no relevant firms found.`

      const extractRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          messages: [{ role: 'user', content: extractPrompt }],
        }),
      })

      if (extractRes.ok) {
        const extractData = await extractRes.json()
        const extractText = extractData.content?.[0]?.text || ''
        try {
          const discovered = JSON.parse(extractText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim())
          if (Array.isArray(discovered)) {
            for (const c of discovered) {
              const verification: any = { source: 'web_discovery' }

              // VERIFY website resolves
              if (c.website) {
                verification.website_verified = await verifyUrl(c.website)
                if (!verification.website_verified) continue // Skip entirely if site doesn't resolve
              } else {
                continue // No website = can't verify = skip
              }

              // VERIFY email domain
              if (c.email) {
                verification.email_verified = await verifyEmailDomain(c.email)
                if (!verification.email_verified) {
                  c.email = null // Strip unverified email
                }
              }

              // Phone: can't auto-verify, keep but flag
              verification.phone_verified = c.phone ? false : null

              // Dedupe against existing DB consultants
              const isDuplicate = existingConsultants?.some((ec: any) =>
                ec.name?.toLowerCase().trim() === c.name?.toLowerCase().trim() ||
                (ec.website && c.website && ec.website.toLowerCase().includes(
                  (() => { try { return new URL(c.website.startsWith('http') ? c.website : `https://${c.website}`).hostname } catch { return '___' } })()
                ))
              )
              if (isDuplicate) continue

              // Dedupe against already-added results
              const alreadyAdded = results.some(r =>
                r.name?.toLowerCase().trim() === c.name?.toLowerCase().trim()
              )
              if (alreadyAdded) continue

              results.push({
                ...c,
                is_existing: false,
                is_verified: verification.website_verified && true,
                verification,
              })
            }
          }
        } catch { /* extraction parse failed */ }
      }
    }

    // Sort by match score descending
    results.sort((a, b) => (b.match_score || 0) - (a.match_score || 0))

    return NextResponse.json({
      consultants: results,
      stats: {
        existing_scored: results.filter(r => r.is_existing).length,
        web_discovered: results.filter(r => !r.is_existing).length,
        sites_checked: discoveredSites.size,
        total: results.length,
      },
    })
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
    phases: [
      'Phase 1: Score existing DB consultants against grant',
      'Phase 2: AI generates Italian search queries',
      'Phase 3: Web search, fetch real sites, extract text',
      'Phase 4: Extract contact info from page content, verify URLs + email domains',
    ],
  })
}
