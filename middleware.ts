import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { checkRateLimit } from '@/lib/api/rate-limit'
import { generateCsrfToken, setCsrfTokenCookie } from '@/lib/security/csrf'

export async function middleware(request: NextRequest) {
  // Generate X-Request-ID for correlation tracking (Web Crypto API - Edge Runtime compatible)
  const requestId = crypto.randomUUID();
  
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
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) => {
            // Force correct cookie options for production HTTPS
            const cookieOptions = {
              ...options,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax' as const,
              path: '/',
            }
            supabaseResponse.cookies.set(name, value, cookieOptions)
          })
        },
      },
    }
  )

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser()

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

  // If on auth pages (login/register) and logged in
  if (isAuthPath) {
    if (!hasCompletedOnboarding) {
      // Incomplete profile → send to onboarding
      const url = request.nextUrl.clone()
      url.pathname = '/onboarding/verifikasi'
      return NextResponse.redirect(url)
    } else {
      // Complete profile → send to browse page
      const url = request.nextUrl.clone()
      url.pathname = '/cari-jodoh'
      return NextResponse.redirect(url)
    }
  }

  // If accessing protected routes but onboarding incomplete
  if (isProtectedPath && !hasCompletedOnboarding) {
    const url = request.nextUrl.clone()
    url.pathname = '/onboarding/verifikasi'
    return NextResponse.redirect(url)
  }

  // If on onboarding page but already completed
  if (isOnboardingPath && hasCompletedOnboarding) {
    const url = request.nextUrl.clone()
    url.pathname = '/cari-jodoh'
    return NextResponse.redirect(url)
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - api routes
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
