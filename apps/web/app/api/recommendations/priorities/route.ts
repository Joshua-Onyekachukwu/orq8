import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function GET(req: NextRequest) {
  const cookie = req.headers.get('cookie') || '';
  const url = new URL(req.url);
  const params = url.searchParams.toString();

  const res = await fetch(`${API_URL}/v1/recommendations/priorities${params ? `?${params}` : ''}`, {
    headers: { cookie },
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
