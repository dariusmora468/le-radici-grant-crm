import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Validates the x-app-password header against the stored app password.
 * Returns null if auth passes, or a NextResponse error if it fails.
 *
 * Usage in any API route:
 *   const authError = await validateAuth(req)
 *   if (authError) return authError
 */
export async function validateAuth(req: NextRequest): Promise<NextResponse | null> {
  const password = req.headers.get('x-app-password')

  if (!password) {
    return NextResponse.json(
      { error: 'Authentication required. Missing x-app-password header.' },
      { status: 401 }
    )
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    )
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'app_password')
    .single()

  if (error || !data || data.value !== password) {
    return NextResponse.json(
      { error: 'Invalid password' },
      { status: 403 }
    )
  }

  return null // Auth passed
}
