import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { checkRateLimit } from '@/lib/api/rate-limit'
import { generateCsrfToken, setCsrfTokenCookie } from '@/lib/security/csrf'

export async function middleware(request: NextRequest) {
  const requestId = crypto.randomUUID();
  
  const url = new URL(request.url)
  const hostname = url.hostname
  const isProduction = hostname.includes('roomahapp.com') || hostname.includes('netlify.app')
  
  // 🔍 ENHANCED DEBUG: Log environment detection
  console.log('[DEBUG] Environment:', {
    hostname,
    isProduction,
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
  })
  
  let supabaseResponse = NextResponse.next({
    request,
  })
  
  supabaseResponse.headers.set('X-Request-ID', requestId)
  
  // Rate limiting for API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const { allowed, remaining, resetTime } = checkRateLimit(request, {
      windowMs: 60 * 1000,
      maxRequests: 100,
    });
    
    if (!allowed) {
      return new NextResponse(
        JSON.stringify({
          error: 'Too many requests',
          retryAfter: Math.ceil((resetTime - Date.now()) / 1000),
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': Math.ceil((resetTime - Date.now()) / 1000).toString(),
            'X-RateLimit-Limit': '100',
            'X-RateLimit-Remaining': remaining.toString(),
            'X-RateLimit-Reset': resetTime.toString(),
            'X-Request-ID': requestId,
          },
        }
      );
    }
    
    supabaseResponse.headers.set('X-RateLimit-Limit', '100');
    supabaseResponse.headers.set('X-RateLimit-Remaining', remaining.toString());
    supabaseResponse.headers.set('X-RateLimit-Reset', resetTime.toString());
  }
  
  // Set CSRF token for non-API routes
  if (!request.nextUrl.pathname.startsWith('/api/')) {
    const csrfToken = generateCsrfToken();
    setCsrfTokenCookie(supabaseResponse, csrfToken);
  }

  // 🔍 ENHANCED DEBUG: Log incoming cookies BEFORE Supabase client
  const incomingCookies = request.cookies.getAll()
  const sbCookiesIn = incomingCookies.filter(c => c.name.startsWith('sb-'))
  console.log('[DEBUG] Incoming cookies:', {
    total: incomingCookies.length,
    supabaseCookies: sbCookiesIn.length,
    names: sbCookiesIn.map(c => ({ name: c.name, valueLength: c.value.length })),
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // 🔍 ENHANCED DEBUG: Log setAll() callback
          console.log('[DEBUG] Supabase setAll() called with', cookiesToSet.length, 'cookies')
          
          cookiesToSet.forEach(({ name, value, options }) => {
            // 🔍 Log each cookie being set
            console.log('[DEBUG] Setting cookie:', {
              name,
              valueLength: value.length,
              originalOptions: options,
              isProduction,
            })
            
            const cookieOptions = {
              ...options,
              secure: isProduction,
            }
            
            // 🔍 Log final options
            console.log('[DEBUG] Final cookie options:', {
              name,
              secure: cookieOptions.secure,
              sameSite: cookieOptions.sameSite,
              path: cookieOptions.path,
              httpOnly: cookieOptions.httpOnly,
              maxAge: cookieOptions.maxAge,
            })
            
            supabaseResponse.cookies.set(name, value, cookieOptions)
          })
        },
      },
    }
  )

  console.log('[MIDDLEWARE DEBUG]', {
    pathname: request.nextUrl.pathname,
    hostname: hostname,
    isProduction: isProduction,
    hasSbCookies: incomingCookies.some(c => c.name.startsWith('sb-')),
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  console.log('[MIDDLEWARE DEBUG] User:', user ? `Authenticated: ${user.id}` : 'Not authenticated')
  
  // 🔍 ENHANCED DEBUG: Log outgoing cookies AFTER getUser()
  const outgoingCookies = supabaseResponse.cookies.getAll()
  const sbCookiesOut = outgoingCookies.filter(c => c.name.startsWith('sb-'))
  console.log('[DEBUG] Outgoing cookies:', {
    total: outgoingCookies.length,
    supabaseCookies: sbCookiesOut.length,
    names: sbCookiesOut.map(c => c.name),
  })

  const pathname = request.nextUrl.pathname

  const protectedPaths = ['/cari-jodoh', '/dashboard', '/cv-saya', '/koin-saya', '/riwayat-taaruf']
  const isProtectedPath = protectedPaths.some((path) => pathname.startsWith(path))

  const authPaths = ['/login', '/register']
  const isAuthPath = authPaths.includes(pathname)

  const isOnboardingPath = pathname.startsWith('/onboarding')
  const isAuthCallback = pathname === '/auth/callback'

  if (isAuthCallback) {
    console.log('[DEBUG] Auth callback - returning supabaseResponse')
    return supabaseResponse
  }

  // If user is NOT logged in
  if (!user) {
    if (isProtectedPath) {
      console.log('[DEBUG] Not authenticated, redirecting to /login')
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('redirectTo', pathname)
      return NextResponse.redirect(url)
    }
    
    return supabaseResponse
  }

  // If user IS logged in, check profile completion
  const { data: profile } = await supabase
    .from('profiles')
    .select('registered_at')
    .eq('user_id', user.id)
    .maybeSingle()

  const hasCompletedOnboarding = profile && profile.registered_at !== null
  
  console.log('[DEBUG] Profile check:', {
    userId: user.id,
    hasProfile: !!profile,
    hasCompletedOnboarding,
  })

  // Redirect authenticated users from auth pages
  if (isAuthPath) {
    if (hasCompletedOnboarding) {
      console.log('[DEBUG] Authenticated user on auth page, redirecting to /cari-jodoh')
      const url = request.nextUrl.clone()
      url.pathname = '/cari-jodoh'
      return NextResponse.redirect(url)
    } else {
      console.log('[DEBUG] Authenticated user on auth page, redirecting to onboarding')
      const url = request.nextUrl.clone()
      url.pathname = '/onboarding/verifikasi'
      return NextResponse.redirect(url)
    }
  }

  // Redirect incomplete onboarding
  if (isProtectedPath && !hasCompletedOnboarding) {
    console.log('[DEBUG] Incomplete onboarding, redirecting to /onboarding/verifikasi')
    const url = request.nextUrl.clone()
    url.pathname = '/onboarding/verifikasi'
    return NextResponse.redirect(url)
  }

  // Allow onboarding access
  if (isOnboardingPath && hasCompletedOnboarding) {
    console.log('[DEBUG] Completed onboarding accessing onboarding page, allowing')
    return supabaseResponse
  }

  console.log('[DEBUG] Returning supabaseResponse')
  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
