'use client'

const AUTH_KEY = 'grant_crm_auth'

export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false
  return sessionStorage.getItem(AUTH_KEY) === 'true'
}

export function setAuthenticated(): void {
  sessionStorage.setItem(AUTH_KEY, 'true')
}

export function clearAuth(): void {
  sessionStorage.removeItem(AUTH_KEY)
}

export async function verifyPassword(password: string): Promise<boolean> {
  const { supabase } = await import('./supabase')
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'app_password')
    .single()

  if (error || !data) return false
  return data.value === password
}
