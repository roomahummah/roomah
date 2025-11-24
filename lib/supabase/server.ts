import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Database } from '@/types/database.types'

/**
 * Create a Supabase client for server-side rendering with cookie-based session
 * This is for use in Server Components, Server Actions, and Route Handlers
 * Respects RLS policies
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          const allCookies = cookieStore.getAll()
          // 🔍 ENHANCED DEBUG: Log cookies read by server client
          console.log('[SERVER CLIENT DEBUG] getAll() called, cookies:', {
            total: allCookies.length,
            supabaseCookies: allCookies.filter(c => c.name.startsWith('sb-')).length,
            names: allCookies.filter(c => c.name.startsWith('sb-')).map(c => c.name),
          })
          return allCookies
        },
        setAll(cookiesToSet) {
          try {
            // 🔍 ENHANCED DEBUG: Log setAll() calls
            console.log('[SERVER CLIENT DEBUG] setAll() called with', cookiesToSet.length, 'cookies')
            
            cookiesToSet.forEach(({ name, value, options }) => {
              const isProduction = process.env.NODE_ENV === 'production' || 
                                   process.env.NEXT_PUBLIC_VERCEL_ENV === 'production'
              
              // 🔍 Log environment detection
              console.log('[SERVER CLIENT DEBUG] Environment:', {
                NODE_ENV: process.env.NODE_ENV,
                VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
                isProduction,
              })
              
              // 🔍 Log original options from Supabase
              console.log('[SERVER CLIENT DEBUG] Original cookie options:', {
                name,
                valueLength: value.length,
                options,
              })
              
              const cookieOptions: CookieOptions = {
                ...options,  // ✅ PRESERVE all Supabase options
                secure: isProduction,  // ✅ ONLY override secure
              }
              
              // 🔍 Log final options
              console.log('[SERVER CLIENT DEBUG] Final cookie options:', {
                name,
                secure: cookieOptions.secure,
                sameSite: cookieOptions.sameSite,
                path: cookieOptions.path,
                httpOnly: cookieOptions.httpOnly,
                maxAge: cookieOptions.maxAge,
              })
              
              cookieStore.set(name, value, cookieOptions)
              
              console.log('[SERVER CLIENT DEBUG] Cookie set successfully:', name)
            })
          } catch (error) {
            // The `setAll` method was called from a Server Component.
            console.error('[SERVER CLIENT DEBUG] setAll() error:', error)
          }
        },
      },
    }
  )
}

/**
 * Create a Supabase admin client with service role key
 * Use this ONLY for admin operations that need to bypass RLS
 * NEVER expose this client to the browser
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[SERVER CLIENT DEBUG] Missing Supabase environment variables')
    throw new Error('Missing Supabase environment variables')
  }

  console.log('[SERVER CLIENT DEBUG] Creating admin client')

  return createServerClient<Database>(supabaseUrl, serviceRoleKey, {
    cookies: {
      getAll: () => [],
      setAll: () => {},
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

/**
 * Get the current authenticated user
 * Use this in Server Components
 */
export async function getCurrentUser() {
  console.log('[SERVER CLIENT DEBUG] getCurrentUser() called')
  const supabase = await createClient()

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error) {
      console.error('[SERVER CLIENT DEBUG] Error getting current user:', error)
      return null
    }

    console.log('[SERVER CLIENT DEBUG] getCurrentUser() result:', user ? `User: ${user.id}` : 'No user')
    return user
  } catch (error) {
    console.error('[SERVER CLIENT DEBUG] Error in getCurrentUser:', error)
    return null
  }
}

/**
 * Backward compatibility aliases
 */
export const supabaseServer = createClient;
export const createServiceClient = createAdminClient;

/**
 * Get the current user's profile
 * Use this in Server Components
 */
export async function getCurrentProfile() {
  const user = await getCurrentUser()
  if (!user) {
    console.log('[SERVER CLIENT DEBUG] getCurrentProfile() - no user')
    return null
  }

  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (error) {
      console.error('[SERVER CLIENT DEBUG] Error getting profile:', error)
      return null
    }

    console.log('[SERVER CLIENT DEBUG] getCurrentProfile() success')
    return data
  } catch (error) {
    console.error('[SERVER CLIENT DEBUG] Error in getCurrentProfile:', error)
    return null
  }
}
