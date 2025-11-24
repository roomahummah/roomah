import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { checkRateLimit } from '@/lib/api/rate-limit'
import { generateCsrfToken, setCsrfTokenCookie } from '@/lib/security/csrf'

export async function middleware(request: NextRequest) {
  const requestId = crypto.randomUUID();
  
  const url = new URL(request.url)
  const hostname = url.hostname
  const isProduction = hostname.includes('roomahapp.com') || hostname.includes('netlify.app')
  
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

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // ✅ Let Supabase SSR handle ALL cookie operations
          // This preserves JWT token integrity
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, {
              ...options,  // ✅ PRESERVE all Supabase options
              secure: isProduction,  // ✅ ONLY override secure for HTTPS
            })
          })
        },
      },
    }
  )

  // DEBUG logging
  console.log('[MIDDLEWARE DEBUG]', {
    pathname: request.nextUrl.pathname,
    hostname: hostname,
    isProduction: isProduction,
    hasSbCookies: request.cookies.getAll().some(c => c.name.startsWith('sb-')),
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  console.log('[MIDDLEWARE DEBUG] User:', user ? `Authenticated: ${user.id}` : 'Not authenticated')

  const pathname = request.nextUrl.pathname

  const protectedPaths = ['/cari-jodoh', '/dashboard', '/cv-saya', '/koin-saya', '/riwayat-taaruf']
  const isProtectedPath = protectedPaths.some((path) => pathname.startsWith(path))

  const authPaths = ['/login', '/register']
  const isAuthPath = authPaths.includes(pathname)

  const isOnboardingPath = pathname.startsWith('/onboarding')
  const isAuthCallback = pathname === '/auth/callback'

  if (isAuthCallback) {
    return supabaseResponse
  }

  // If user is NOT logged in
  if (!user) {
    if (isProtectedPath) {
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

  // Redirect authenticated users from auth pages
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

  // Redirect incomplete onboarding
  if (isProtectedPath && !hasCompletedOnboarding) {
    const url = request.nextUrl.clone()
    url.pathname = '/onboarding/verifikasi'
    return NextResponse.redirect(url)
  }

  // Allow onboarding access
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
