import type { Grant, Project } from './supabase'

interface ScoreBreakdown {
  score: number
  reasons: string[]
  warnings: string[]
}

/**
 * Compute a dynamic relevance score (0-100) for a grant based on the user's project profile.
 * Replaces static relevance_score with real matching.
 */
export function computeRelevance(grant: Grant, project: Project): ScoreBreakdown {
  let score = 0
  const maxScore = 100
  const reasons: string[] = []
  const warnings: string[] = []

  // === ELIGIBILITY CHECKS (binary, high weight) ===

  // Young farmer requirement (20 points)
  if (grant.requires_young_farmer) {
    if (project.young_farmer_eligible) {
      score += 20
      reasons.push('Young farmer eligible')
    } else {
      score -= 15
      warnings.push('Requires young farmer status')
    }
  } else {
    score += 10 // No requirement = neutral positive
  }

  // Agricultural entity requirement (15 points)
  if (grant.requires_agricultural_entity) {
    const hasAgEntity = project.entity_type?.toLowerCase().includes('agricol') ||
      project.entity_type?.toLowerCase().includes('farm') ||
      project.entity_status === 'Active'
    if (hasAgEntity) {
      score += 15
      reasons.push('Agricultural entity match')
    } else if (project.entity_status === 'Being formed' || project.entity_status === 'Planned') {
      score += 5
      warnings.push('Agricultural entity in progress')
    } else {
      score -= 10
      warnings.push('Requires agricultural entity')
    }
  } else {
    score += 8
  }

  // BSA heritage requirement (10 points)
  if (grant.requires_bsa_heritage) {
    if (project.heritage_classification) {
      score += 10
      reasons.push('Heritage classification match')
    } else {
      score -= 10
      warnings.push('Requires heritage classification')
    }
  } else {
    score += 5
  }

  // === FINANCIAL FIT (15 points) ===
  if (grant.co_financing_pct && project.co_financing_capacity_pct) {
    if (project.co_financing_capacity_pct >= grant.co_financing_pct) {
      score += 15
      reasons.push('Co-financing capacity sufficient')
    } else if (project.co_financing_capacity_pct >= grant.co_financing_pct * 0.7) {
      score += 8
      warnings.push('Co-financing capacity is tight')
    } else {
      score += 2
      warnings.push('Co-financing gap')
    }
  } else {
    score += 8 // Unknown = neutral
  }

  // Investment amount fit (10 points)
  if (grant.max_amount && project.total_investment_estimate) {
    const ratio = grant.max_amount / project.total_investment_estimate
    if (ratio >= 0.1 && ratio <= 2) {
      score += 10
      reasons.push('Funding amount aligns with investment')
    } else if (ratio < 0.1) {
      score += 3
      warnings.push('Grant is small relative to project')
    } else {
      score += 5
    }
  } else {
    score += 5
  }

  // === SECTOR & CATEGORY MATCH (15 points) ===
  const grantCategoryName = (grant as any).category?.name?.toLowerCase() || ''
  const projectSector = project.primary_sector?.toLowerCase() || ''
  const projectSecondary = (project.secondary_sectors || []).map(s => s.toLowerCase())

  if (grantCategoryName && projectSector) {
    // Direct sector match
    if (projectSector.includes(grantCategoryName) || grantCategoryName.includes(projectSector)) {
      score += 15
      reasons.push('Direct sector match')
    } else if (projectSecondary.some(s => s.includes(grantCategoryName) || grantCategoryName.includes(s))) {
      score += 10
      reasons.push('Secondary sector match')
    } else {
      // Cross-matching common overlaps
      const crossMatches: Record<string, string[]> = {
        'agriculture': ['rural development', 'young farmer', 'tourism & hospitality'],
        'heritage & culture': ['tourism & hospitality', 'infrastructure', 'rural development'],
        'tourism & hospitality': ['heritage & culture', 'agriculture', 'rural development'],
        'rural development': ['agriculture', 'infrastructure', 'tourism & hospitality'],
        'energy & sustainability': ['agriculture', 'infrastructure', 'rural development'],
      }
      const related = crossMatches[grantCategoryName] || []
      if (related.some(r => projectSector.includes(r) || projectSecondary.some(s => s.includes(r)))) {
        score += 7
        reasons.push('Related sector')
      } else {
        score += 2
      }
    }
  } else {
    score += 7 // No info = neutral
  }

  // === WINDOW STATUS (5 points) ===
  if (grant.window_status === 'Open' || grant.window_status === 'Closing soon') {
    score += 5
    reasons.push('Currently open')
  } else if (grant.window_status === 'Rolling') {
    score += 4
    reasons.push('Rolling applications')
  } else if (grant.window_status === 'Not yet open') {
    score += 3
  } else if (grant.window_status === 'Closed') {
    score -= 5
    warnings.push('Currently closed')
  }

  // === COUNTRY/REGION MATCH (5 points) ===
  const grantSource = grant.funding_source?.toLowerCase() || ''
  const projCountry = project.country?.toLowerCase() || ''
  if (grantSource === 'regional' && project.region) {
    score += 5
    reasons.push('Regional program')
  } else if (grantSource === 'national' && projCountry) {
    score += 4
  } else if (grantSource === 'eu') {
    score += 3
  } else {
    score += 2
  }

  // Normalize to 0-100
  const normalized = Math.max(0, Math.min(maxScore, Math.round(score)))

  return { score: normalized, reasons, warnings }
}
