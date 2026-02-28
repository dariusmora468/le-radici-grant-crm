import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const PIPELINE_STAGES = [
  'Discovered',
  'Researching',
  'Serious Consideration',
  'Preparing Application',
  'Submitted',
  'Under Review',
  'Awarded',
  'Rejected',
  'Follow-up',
  'Archived',
] as const

export type PipelineStage = typeof PIPELINE_STAGES[number]

export const STAGE_COLORS: Record<string, string> = {
  'Discovered': 'bg-slate-100 text-slate-600',
  'Researching': 'bg-blue-50 text-blue-600',
  'Serious Consideration': 'bg-blue-100 text-blue-700',
  'Preparing Application': 'bg-indigo-50 text-indigo-600',
  'Submitted': 'bg-violet-100 text-violet-700',
  'Under Review': 'bg-amber-50 text-amber-700',
  'Awarded': 'bg-emerald-100 text-emerald-700',
  'Rejected': 'bg-rose-50 text-rose-600',
  'Follow-up': 'bg-orange-50 text-orange-600',
  'Archived': 'bg-slate-50 text-slate-400',
}

export const FUNDING_SOURCES = ['EU', 'National', 'Regional', 'Local', 'Private', 'Mixed'] as const
export const FUNDING_TYPES = ['Grant', 'Subsidized Loan', 'Tax Credit', 'Mixed', 'Guarantee', 'Other'] as const
export const EFFORT_LEVELS = ['Low', 'Medium', 'High', 'Very High'] as const
export const PRIORITY_LEVELS = ['Critical', 'High', 'Medium', 'Low'] as const
export const WINDOW_STATUSES = ['Not yet open', 'Open', 'Closing soon', 'Closed', 'Rolling', 'Unknown'] as const

export interface Grant {
  id: string
  name: string
  name_it: string | null
  funding_source: string
  category_id: string | null
  description: string | null
  description_it: string | null
  min_amount: number | null
  max_amount: number | null
  co_financing_pct: number | null
  funding_type: string | null
  eligibility_summary: string | null
  requires_young_farmer: boolean | null
  requires_female_farmer: boolean | null
  requires_agricultural_entity: boolean | null
  requires_bsa_heritage: boolean | null
  application_window_opens: string | null
  application_window_closes: string | null
  window_status: string | null
  processing_time_months: number | null
  official_url: string | null
  documentation_url: string | null
  regulation_reference: string | null
  relevance_score: number | null
  effort_level: string | null
  notes: string | null
  research_notes: string | null
  created_at: string | null
  updated_at: string | null
  category?: GrantCategory | null
}

export interface GrantCategory {
  id: string
  name: string
  color: string | null
  icon: string | null
}

export interface GrantApplication {
  id: string
  project_id: string | null
  grant_id: string | null
  stage: string
  target_amount: number | null
  assigned_to: string | null
  consultant_id: string | null
  priority: string | null
  internal_deadline: string | null
  submission_date: string | null
  expected_response_date: string | null
  documents_ready: boolean | null
  prerequisites_met: boolean | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
  grant?: Grant | null
  consultant?: Consultant | null
}

export interface Consultant {
  id: string
  name: string
  organization: string | null
  email: string | null
  phone: string | null
  specialization: string | null
  region: string | null
  website: string | null
  notes: string | null
  created_at: string | null
}

export interface ApplicationRequirement {
  id: string
  application_id: string | null
  requirement: string
  is_met: boolean | null
  notes: string | null
  sort_order: number | null
}

export interface ActivityLog {
  id: string
  application_id: string | null
  grant_id: string | null
  action: string
  details: string | null
  performed_by: string | null
  created_at: string | null
}

export interface Project {
  id: string
  name: string
  description: string | null
  country: string | null
  region: string | null
}
