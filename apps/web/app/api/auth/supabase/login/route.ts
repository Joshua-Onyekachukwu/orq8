import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '../../../../../lib/supabase-server';
import { SESSION_COOKIE, API_URL } from '../../../../../lib/api';
import { cookies } from 'next/headers';

/**
 * POST /api/auth/supabase/login
 *
 * Authenticates via Supabase Auth, returns ORQ8 session.
 * Body: { email, password }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: { code: 'validation', message: 'Email and password required' } },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServer();

    // 1. Authenticate via Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      return NextResponse.json(
        { error: { code: 'auth', message: 'Invalid email or password' } },
        { status: 401 }
      );
    }

    // 2. Also login via ORQ8 backend (for backward compat)
    const res = await fetch(`${API_URL}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }

    // 3. Set the ORQ8 session cookie
    const cookieStore = await cookies();
    const token = data.data?.token;
    if (token) {
      cookieStore.set({
        name: SESSION_COOKIE,
        value: token,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 30 * 24 * 60 * 60,
      });
    }

    return NextResponse.json({
      data: {
        user: {
          id: authData.user.id,
          email: authData.user.email,
        },
        org: data.data?.org,
        token,
        supabase_user_id: authData.user.id,
      },
    });
  } catch (err) {
    console.error('[Supabase Login]', err);
    return NextResponse.json(
      { error: { code: 'internal', message: 'Login failed' } },
      { status: 500 }
    );
  }
}
