import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '../../../../../lib/supabase-server';

/**
 * GET /api/auth/supabase/session
 *
 * Returns current Supabase Auth session info.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServer();

    // Get session from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { data: { authenticated: false } },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7);
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      return NextResponse.json(
        { data: { authenticated: false } },
        { status: 401 }
      );
    }

    return NextResponse.json({
      data: {
        authenticated: true,
        user: {
          id: data.user.id,
          email: data.user.email,
          created_at: data.user.created_at,
        },
      },
    });
  } catch (err) {
    console.error('[Supabase Session]', err);
    return NextResponse.json(
      { error: { code: 'internal', message: 'Session check failed' } },
      { status: 500 }
    );
  }
}
