'use client'

const AUTH_KEY = 'grant_crm_auth'
const PASSWORD_KEY = 'grant_crm_password'

export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false
  // Must have both the auth flag AND the actual password stored
  // This self-heals sessions from before the password storage migration
  return sessionStorage.getItem(AUTH_KEY) === 'true' && !!sessionStorage.getItem(PASSWORD_KEY)
}

export function setAuthenticated(password: string): void {
  sessionStorage.setItem(AUTH_KEY, 'true')
  sessionStorage.setItem(PASSWORD_KEY, password)
}

export function getStoredPassword(): string {
  if (typeof window === 'undefined') return ''
  return sessionStorage.getItem(PASSWORD_KEY) || ''
}

export function clearAuth(): void {
  sessionStorage.removeItem(AUTH_KEY)
  sessionStorage.removeItem(PASSWORD_KEY)
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
