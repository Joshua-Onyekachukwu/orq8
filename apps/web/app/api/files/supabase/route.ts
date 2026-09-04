import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '../../../../lib/supabase-server';
import { SESSION_COOKIE, API_URL } from '../../../../lib/api';
import { cookies } from 'next/headers';

const BUCKET = 'orq8-files';

/**
 * POST /api/files/supabase
 *
 * Upload a file to Supabase Storage and register it in ORQ8.
 * Body: FormData with 'file' field
 */
export async function POST(request: NextRequest) {
  try {
    // Auth check
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) {
      return NextResponse.json(
        { error: { code: 'auth.unauthorized', message: 'Authentication required' } },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json(
        { error: { code: 'validation', message: 'No file provided' } },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServer();

    // Generate unique path
    const ext = file.name.split('.').pop() ?? 'bin';
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    // Upload to Supabase Storage
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) {
      console.error('[Supabase Storage]', uploadError);
      return NextResponse.json(
        { error: { code: 'storage', message: uploadError.message } },
        { status: 500 }
      );
    }

    // Register in ORQ8 backend
    const res = await fetch(`${API_URL}/v1/files`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        body: buffer.toString('base64'),
        storageKey: path,
        storageProvider: 'supabase',
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      // Rollback: delete from Supabase
      await supabase.storage.from(BUCKET).remove([path]);
      return NextResponse.json(data, { status: res.status });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error('[Supabase Upload]', err);
    return NextResponse.json(
      { error: { code: 'internal', message: 'Upload failed' } },
      { status: 500 }
    );
  }
}

/**
 * GET /api/files/supabase
 *
 * List files from Supabase Storage.
 */
export async function GET() {
  try {
    const supabase = getSupabaseServer();

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

    if (error) {
      return NextResponse.json(
        { error: { code: 'storage', message: error.message } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    console.error('[Supabase List]', err);
    return NextResponse.json(
      { error: { code: 'internal', message: 'List failed' } },
      { status: 500 }
    );
  }
}
