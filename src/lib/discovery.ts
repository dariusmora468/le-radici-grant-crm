import { supabase } from './supabase'
import type { Project } from './supabase'

export interface DiscoveredGrant {
  name: string
  name_it: string | null
  funding_source: string
  funding_type: string
  description: string
  eligibility_summary: string
  min_amount: number | null
  max_amount: number | null
  co_financing_pct: number | null
  application_window_opens: string | null
  application_window_closes: string | null
  window_status: string
  official_url: string | null
  regulation_reference: string | null
  relevance_score: number
  effort_level: string
  requires_young_farmer: boolean
  requires_agricultural_entity: boolean
  requires_bsa_heritage: boolean
  notes: string | null
}

export type DiscoveryPhase =
  | 'analyzing'
  | 'searching_eu'
  | 'searching_national'
  | 'searching_regional'
  | 'matching'
  | 'structuring'
  | 'saving'
  | 'complete'
  | 'error'

export interface DiscoveryProgress {
  phase: DiscoveryPhase
  message: string
  pct: number
}

const PHASE_INFO: Record<DiscoveryPhase, { message: string; pct: number }> = {
  analyzing: { message: 'Analyzing your project profile...', pct: 5 },
  searching_eu: { message: 'Searching EU funding databases...', pct: 20 },
  searching_national: { message: 'Searching Italian national programs...', pct: 40 },
  searching_regional: { message: 'Searching Tuscan regional funds...', pct: 60 },
  matching: { message: 'Matching eligibility criteria...', pct: 75 },
  structuring: { message: 'Structuring results...', pct: 88 },
  saving: { message: 'Saving grants to your library...', pct: 95 },
  complete: { message: 'Discovery complete', pct: 100 },
  error: { message: 'Something went wrong', pct: 0 },
}

export function getPhaseInfo(phase: DiscoveryPhase): DiscoveryProgress {
  const info = PHASE_INFO[phase]
  return { phase, ...info }
}

function buildSystemPrompt(): string {
  return `You are an expert EU and Italian grant research specialist. Your job is to find ALL available grants, funds, subsidized loans, tax credits, and financial incentives that a project might qualify for.

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
  "relevance_score": 1-5 (5 = highly relevant),
  "effort_level": "Low" | "Medium" | "High" | "Very High",
  "requires_young_farmer": boolean,
  "requires_agricultural_entity": boolean,
  "requires_bsa_heritage": boolean,
  "notes": "Any important notes about this specific opportunity for this project" or null
}

Find at least 15 grants. Be thorough. Include both obvious and less-known opportunities. Sort by relevance_score descending.`
}

function buildUserPrompt(project: Project): string {
  const sectors = [project.primary_sector, ...(project.secondary_sectors || [])].filter(Boolean).join(', ')
  const objectives = (project.objectives || []).join(', ')
  const landUse = (project.land_use_types || []).join(', ')

  return `Find all available grants and funding for this project:

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
}

export async function discoverGrants(
  project: Project,
  onPhase: (progress: DiscoveryProgress) => void
): Promise<{ grants: DiscoveredGrant[]; saved: number; error?: string }> {
  try {
    // Phase: Analyzing
    onPhase(getPhaseInfo('analyzing'))
    await sleep(800)

    // Phase: Searching EU
    onPhase(getPhaseInfo('searching_eu'))

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: buildSystemPrompt(),
        messages: [{ role: 'user', content: buildUserPrompt(project) }],
      }),
    })

    // Phase: Searching national (during API call processing)
    onPhase(getPhaseInfo('searching_national'))

    if (!response.ok) {
      const err = await response.text()
      console.error('API error:', err)
      throw new Error(`API returned ${response.status}`)
    }

    // Phase: Searching regional
    onPhase(getPhaseInfo('searching_regional'))

    const data = await response.json()

    // Phase: Matching
    onPhase(getPhaseInfo('matching'))
    await sleep(600)

    // Extract text content from response
    const textBlocks = data.content
      .filter((item: any) => item.type === 'text')
      .map((item: any) => item.text)
      .join('\n')

    // Phase: Structuring
    onPhase(getPhaseInfo('structuring'))
    await sleep(400)

    // Parse JSON from response
    let grants: DiscoveredGrant[] = []
    try {
      const cleaned = textBlocks.replace(/```json|```/g, '').trim()
      // Find the JSON array in the response
      const arrayMatch = cleaned.match(/\[[\s\S]*\]/)
      if (arrayMatch) {
        grants = JSON.parse(arrayMatch[0])
      } else {
        throw new Error('No JSON array found in response')
      }
    } catch (parseErr) {
      console.error('Parse error:', parseErr, 'Raw text:', textBlocks.substring(0, 500))
      throw new Error('Failed to parse grant data from AI response')
    }

    // Phase: Saving
    onPhase(getPhaseInfo('saving'))

    // Save to Supabase
    let savedCount = 0
    for (const grant of grants) {
      // Check if grant already exists by name
      const { data: existing } = await supabase
        .from('grants')
        .select('id')
        .eq('name', grant.name)
        .limit(1)

      if (existing && existing.length > 0) continue

      const { error } = await supabase.from('grants').insert({
        name: grant.name,
        name_it: grant.name_it,
        funding_source: grant.funding_source || 'Unknown',
        funding_type: grant.funding_type || 'Grant',
        description: grant.description,
        eligibility_summary: grant.eligibility_summary,
        min_amount: grant.min_amount,
        max_amount: grant.max_amount,
        co_financing_pct: grant.co_financing_pct,
        application_window_opens: grant.application_window_opens,
        application_window_closes: grant.application_window_closes,
        window_status: grant.window_status || 'Unknown',
        official_url: grant.official_url,
        regulation_reference: grant.regulation_reference,
        relevance_score: grant.relevance_score,
        effort_level: grant.effort_level || 'Medium',
        requires_young_farmer: grant.requires_young_farmer || false,
        requires_female_farmer: false,
        requires_agricultural_entity: grant.requires_agricultural_entity || false,
        requires_bsa_heritage: grant.requires_bsa_heritage || false,
        notes: grant.notes,
        research_notes: `Discovered via AI research on ${new Date().toISOString().split('T')[0]}`,
      })

      if (!error) savedCount++
    }

    // Phase: Complete
    onPhase(getPhaseInfo('complete'))

    return { grants, saved: savedCount }
  } catch (err: any) {
    onPhase({ phase: 'error', message: err.message || 'Discovery failed', pct: 0 })
    return { grants: [], saved: 0, error: err.message }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
