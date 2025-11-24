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
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              // ✅ CRITICAL FIX: ONLY override secure, preserve ALL other Supabase options
              // This prevents JWT token corruption by maintaining original maxAge, httpOnly, etc.
              const isProduction = process.env.NODE_ENV === 'production' || 
                                   process.env.NEXT_PUBLIC_VERCEL_ENV === 'production'
              
              const cookieOptions: CookieOptions = {
                ...options,  // ✅ PRESERVE all Supabase options (maxAge, httpOnly, sameSite, path)
                secure: isProduction,  // ✅ ONLY override secure for HTTPS
              }
              
              cookieStore.set(name, value, cookieOptions)
            })
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
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
    throw new Error('Missing Supabase environment variables')
  }

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
  const supabase = await createClient()

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error) {
      console.error('Error getting current user:', error)
      return null
    }

    return user
  } catch (error) {
    console.error('Error in getCurrentUser:', error)
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
  if (!user) return null

  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (error) {
      console.error('Error getting profile:', error)
      return null
    }

    return data
  } catch (error) {
    console.error('Error in getCurrentProfile:', error)
    return null
  }
}
