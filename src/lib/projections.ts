import type { Grant } from './supabase'

/**
 * Realistic Grant Projection Engine
 *
 * Weights each grant's max amount by relevance score and window status
 * to produce a grounded "expected value" rather than raw totals.
 *
 * Relevance score mapping (1-5 scale to probability):
 *   5 = 80%, 4 = 60%, 3 = 40%, 2 = 20%, 1 = 10%, none = 15%
 *
 * Status multiplier:
 *   Open / Closing soon = 1.0
 *   Rolling = 0.7
 *   Not yet open = 0.5
 *   Unknown = 0.3
 *   Closed = 0
 */

function getEffectiveWindowStatus(grant: Grant): string {
  if (grant.application_window_closes) {
    const now = new Date()
    const closes = new Date(grant.application_window_closes)
    const daysLeft = Math.ceil((closes.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (daysLeft <= 0) return 'Closed'
    if (daysLeft <= 14) return 'Closing soon'
  }
  return grant.window_status || 'Unknown'
}

const RELEVANCE_PROBABILITY: Record<number, number> = {
  5: 0.80,
  4: 0.60,
  3: 0.40,
  2: 0.20,
  1: 0.10,
}
const DEFAULT_RELEVANCE_PROBABILITY = 0.15

const STATUS_MULTIPLIER: Record<string, number> = {
  'Open': 1.0,
  'Closing soon': 1.0,
  'Rolling': 0.7,
  'Not yet open': 0.5,
  'Unknown': 0.3,
  'Closed': 0,
}

export interface GrantProjection {
  grantId: string
  grantName: string
  maxAmount: number
  minAmount: number
  relevanceScore: number | null
  effectiveStatus: string
  probability: number
  statusMultiplier: number
  combinedProbability: number
  expectedValue: number
  expectedMin: number
}

export function getGrantProjection(grant: Grant): GrantProjection {
  const effectiveStatus = getEffectiveWindowStatus(grant)
  const maxAmount = grant.max_amount || 0
  const minAmount = grant.min_amount || 0
  const relevanceScore = grant.relevance_score

  const probability = relevanceScore !== null && relevanceScore in RELEVANCE_PROBABILITY
    ? RELEVANCE_PROBABILITY[relevanceScore]
    : DEFAULT_RELEVANCE_PROBABILITY

  const statusMult = STATUS_MULTIPLIER[effectiveStatus] ?? 0.3

  const combinedProbability = probability * statusMult
  const expectedValue = maxAmount * combinedProbability
  const expectedMin = minAmount * combinedProbability

  return {
    grantId: grant.id,
    grantName: grant.name,
    maxAmount,
    minAmount,
    relevanceScore,
    effectiveStatus,
    probability,
    statusMultiplier: statusMult,
    combinedProbability,
    expectedValue,
    expectedMin,
  }
}

export interface RealisticProjectionSummary {
  totalAddressable: number
  realisticTotal: number
  realisticMin: number
  grantCount: number
  activeGrantCount: number
  highProbabilityCount: number
  projections: GrantProjection[]
}

export function getRealisticTotal(grants: Grant[]): RealisticProjectionSummary {
  const projections = grants.map(getGrantProjection)

  const activeProjections = projections.filter(p => p.effectiveStatus !== 'Closed')

  const totalAddressable = activeProjections.reduce((sum, p) => sum + p.maxAmount, 0)
  const realisticTotal = activeProjections.reduce((sum, p) => sum + p.expectedValue, 0)
  const realisticMin = activeProjections.reduce((sum, p) => sum + p.expectedMin, 0)
  const highProbabilityCount = activeProjections.filter(p => p.combinedProbability >= 0.5).length

  return {
    totalAddressable,
    realisticTotal,
    realisticMin,
    grantCount: grants.length,
    activeGrantCount: activeProjections.length,
    highProbabilityCount,
    projections,
  }
}

/**
 * Get a human-readable probability label and color for a single grant
 */
export function getProbabilityDisplay(combinedProbability: number): {
  label: string
  color: string
  bgColor: string
  percentage: number
} {
  const percentage = Math.round(combinedProbability * 100)

  if (percentage >= 60) return { label: 'High', color: 'text-emerald-600', bgColor: 'bg-emerald-50', percentage }
  if (percentage >= 35) return { label: 'Medium', color: 'text-amber-600', bgColor: 'bg-amber-50', percentage }
  if (percentage >= 15) return { label: 'Low', color: 'text-orange-500', bgColor: 'bg-orange-50', percentage }
  return { label: 'Very Low', color: 'text-slate-400', bgColor: 'bg-slate-50', percentage }
}
