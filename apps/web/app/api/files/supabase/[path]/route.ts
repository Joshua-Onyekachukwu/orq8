import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '../../../../../lib/supabase-server';

const BUCKET = 'orq8-files';

/**
 * GET /api/files/supabase/[path]
 *
 * Download a file from Supabase Storage.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string }> }
) {
  try {
    const { path } = await params;
    const supabase = getSupabaseServer();

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .download(path);

    if (error) {
      return NextResponse.json(
        { error: { code: 'storage', message: error.message } },
        { status: 404 }
      );
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    const headers = new Headers();
    headers.set('Content-Type', data.type || 'application/octet-stream');
    headers.set('Content-Length', buffer.length.toString());
    headers.set('Cache-Control', 'public, max-age=31536000');

    return new NextResponse(buffer, { headers });
  } catch (err) {
    console.error('[Supabase Download]', err);
    return NextResponse.json(
      { error: { code: 'internal', message: 'Download failed' } },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/files/supabase/[path]
 *
 * Delete a file from Supabase Storage.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string }> }
) {
  try {
    const { path } = await params;
    const supabase = getSupabaseServer();

    const { error } = await supabase.storage.from(BUCKET).remove([path]);

    if (error) {
      return NextResponse.json(
        { error: { code: 'storage', message: error.message } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: { deleted: true } });
  } catch (err) {
    console.error('[Supabase Delete]', err);
    return NextResponse.json(
      { error: { code: 'internal', message: 'Delete failed' } },
      { status: 500 }
    );
  }
}
