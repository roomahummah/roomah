import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { checkRateLimit } from '@/lib/api/rate-limit'
import { generateCsrfToken, setCsrfTokenCookie } from '@/lib/security/csrf'

export async function middleware(request: NextRequest) {
  // Generate X-Request-ID for correlation tracking (Web Crypto API - Edge Runtime compatible)
  const requestId = crypto.randomUUID();
  
  // Detect production environment and hostname
  const url = new URL(request.url)
  const hostname = url.hostname
  const isProduction = hostname.includes('roomahapp.com') || hostname.includes('netlify.app')
  
  let supabaseResponse = NextResponse.next({
    request,
  })
  
  // Add Request ID to response headers
  supabaseResponse.headers.set('X-Request-ID', requestId)
  
  // Rate limiting for API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const { allowed, remaining, resetTime } = checkRateLimit(request, {
      windowMs: 60 * 1000, // 1 minute
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
    
    // Add rate limit headers
    supabaseResponse.headers.set('X-RateLimit-Limit', '100');
    supabaseResponse.headers.set('X-RateLimit-Remaining', remaining.toString());
    supabaseResponse.headers.set('X-RateLimit-Reset', resetTime.toString());
  }
  
  // Set CSRF token for non-API routes
  if (!request.nextUrl.pathname.startsWith('/api/')) {
    const csrfToken = generateCsrfToken();
    setCsrfTokenCookie(supabaseResponse, csrfToken);
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Set cookies on the existing supabaseResponse
          cookiesToSet.forEach(({ name, value, options }) => {
            const cookieOptions = {
              ...options,
              secure: isProduction,
              sameSite: 'lax' as const,
              path: '/',
              httpOnly: true,
              maxAge: options?.maxAge || 60 * 60 * 24 * 7, // Default 7 days
            }
            supabaseResponse.cookies.set(name, value, cookieOptions)
          })
        },
      },
    }
  )

  // TEMPORARY DEBUG LOGGING
  const incomingCookies = request.cookies.getAll()
  console.log('[MIDDLEWARE DEBUG]', {
    pathname: request.nextUrl.pathname,
    hostname: hostname,
    isProduction: isProduction,
    incomingCookiesCount: incomingCookies.length,
    hasSbCookies: incomingCookies.some(c => c.name.startsWith('sb-')),
    cookieNames: incomingCookies.map(c => c.name)
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  console.log('[MIDDLEWARE DEBUG] User:', user ? `Authenticated: ${user.id}` : 'Not authenticated')

  // CRITICAL: Propagate Supabase cookies to response
  // This is necessary because getUser() only READS cookies, doesn't WRITE to response
  // Without this, browser won't refresh cookies and they'll expire
  const sbCookies = request.cookies.getAll().filter(c => c.name.startsWith('sb-'))
  if (sbCookies.length > 0) {
    console.log('[MIDDLEWARE DEBUG] Propagating', sbCookies.length, 'Supabase cookies')
    sbCookies.forEach(cookie => {
      // IMPORTANT: Only use name and value from request cookie
      // Set all other attributes explicitly with known-good values
      supabaseResponse.cookies.set(
        cookie.name,
        cookie.value,
        {
          secure: isProduction,
          sameSite: 'lax',
          path: '/',
          httpOnly: true,
          maxAge: 60 * 60 * 24 * 7, // 7 days
        }
      )
    })
  }

  const pathname = request.nextUrl.pathname

  // Protected routes - require authentication and completed onboarding
  const protectedPaths = ['/cari-jodoh', '/dashboard', '/cv-saya', '/koin-saya', '/riwayat-taaruf']
  const isProtectedPath = protectedPaths.some((path) => pathname.startsWith(path))

  // Auth routes - login and register pages
  const authPaths = ['/login', '/register']
  const isAuthPath = authPaths.includes(pathname)

  // Onboarding routes
  const isOnboardingPath = pathname.startsWith('/onboarding')

  // Auth callback route - never redirect
  const isAuthCallback = pathname === '/auth/callback'

  if (isAuthCallback) {
    return supabaseResponse
  }

  // If user is NOT logged in
  if (!user) {
    // Redirect protected routes to login
    if (isProtectedPath) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('redirectTo', pathname)
      return NextResponse.redirect(url)
    }
    
    // Allow access to auth pages and onboarding when not logged in
    return supabaseResponse
  }

  // If user IS logged in, check profile completion
  const { data: profile } = await supabase
    .from('profiles')
    .select('registered_at')
    .eq('user_id', user.id)
    .maybeSingle()

  const hasCompletedOnboarding = profile && profile.registered_at !== null

  // If user is logged in and trying to access auth pages (login/register)
  // Redirect them to app home if onboarding completed, or onboarding if not
  if (isAuthPath) {
    if (hasCompletedOnboarding) {
      const url = request.nextUrl.clone()
      url.pathname = '/cari-jodoh'
      return NextResponse.redirect(url)
    } else {
      const url = request.nextUrl.clone()
      url.pathname = '/onboarding/verifikasi'
      return NextResponse.redirect(url)
    }
  }

  // If accessing protected routes but onboarding incomplete
  if (isProtectedPath && !hasCompletedOnboarding) {
    const url = request.nextUrl.clone()
    url.pathname = '/onboarding/verifikasi'
    return NextResponse.redirect(url)
  }

  // If on onboarding page but already completed - allow access
  if (isOnboardingPath && hasCompletedOnboarding) {
    return supabaseResponse
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
