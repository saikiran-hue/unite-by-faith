import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { needsAgeCheck } from '@/lib/age-gate';

/**
 * Refreshes the Supabase session cookies on every request and sends page
 * requests without a signed-in user to /auth. API routes are not redirected:
 * they answer 401 { error: 'signed_out' } themselves via requireUserId().
 * A Google account that has not confirmed it is 18+ can only reach the age check:
 * pages redirect to /auth/age, other API routes answer 403 { error: 'age_required' }.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() revalidates the token with Supabase Auth (getSession() would not).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const open =
    pathname === '/auth' ||
    pathname === '/privacy' ||
    pathname === '/terms' ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/api/');

  const keepCookies = (res: NextResponse) => {
    response.cookies.getAll().forEach((c) => res.cookies.set(c.name, c.value));
    return res;
  };

  if (user && needsAgeCheck(user)) {
    const allowed =
      pathname === '/auth/age' || pathname === '/auth/callback' || pathname.startsWith('/api/auth/');
    if (!allowed) {
      return keepCookies(
        pathname.startsWith('/api/')
          ? NextResponse.json({ error: 'age_required' }, { status: 403 })
          : NextResponse.redirect(new URL('/auth/age', request.url))
      );
    }
  }

  if (!user && !open) {
    const redirect = NextResponse.redirect(new URL('/auth', request.url));
    response.cookies
      .getAll()
      .forEach((c) => redirect.cookies.set(c.name, c.value));
    return redirect;
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
