import { proxyApiJson } from '../../../lib/api';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  return proxyApiJson(request, '/v1/members/all');
}
