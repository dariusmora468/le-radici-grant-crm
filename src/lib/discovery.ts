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
  searching_eu: { message: 'Searching EU funding databases...', pct: 15 },
  searching_national: { message: 'Searching Italian national programs...', pct: 35 },
  searching_regional: { message: 'Searching Tuscan regional funds...', pct: 55 },
  matching: { message: 'Matching eligibility criteria...', pct: 72 },
  structuring: { message: 'Structuring results...', pct: 88 },
  saving: { message: 'Saving grants to your library...', pct: 95 },
  complete: { message: 'Discovery complete', pct: 100 },
  error: { message: 'Something went wrong', pct: 0 },
}

export function getPhaseInfo(phase: DiscoveryPhase): DiscoveryProgress {
  const info = PHASE_INFO[phase]
  return { phase, ...info }
}

export async function discoverGrants(
  project: Project,
  onPhase: (progress: DiscoveryProgress) => void
): Promise<{ grants: DiscoveredGrant[]; saved: number; error?: string }> {
  try {
    // Phase: Analyzing
    onPhase(getPhaseInfo('analyzing'))
    await sleep(600)

    // Phase: Searching EU - start the API call
    onPhase(getPhaseInfo('searching_eu'))

    // Simulate progress during the long API call
    const progressInterval = setInterval(() => {
      // Auto-advance through phases while waiting
      onPhase(getPhaseInfo('searching_national'))
      setTimeout(() => onPhase(getPhaseInfo('searching_regional')), 8000)
      setTimeout(() => onPhase(getPhaseInfo('matching')), 20000)
    }, 6000)

    // Call our server-side API route (not Anthropic directly)
    const response = await fetch('/api/discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project }),
    })

    clearInterval(progressInterval)

    if (!response.ok) {
      const err = await response.json()
      throw new Error(err.error || `Server returned ${response.status}`)
    }

    const data = await response.json()
    const grants: DiscoveredGrant[] = data.grants || []

    // Phase: Structuring
    onPhase(getPhaseInfo('structuring'))
    await sleep(500)

    // Phase: Saving to Supabase
    onPhase(getPhaseInfo('saving'))

    let savedCount = 0
    for (const grant of grants) {
      // Check for duplicates by name
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
