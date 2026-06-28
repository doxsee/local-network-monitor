import { NextResponse } from 'next/server';

import { getAllowedInterfaces } from '@/lib/capture-manager';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ interfaces: getAllowedInterfaces() });
}