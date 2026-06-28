import { NextResponse } from 'next/server';

import { getCaptureManager } from '@/lib/capture-manager';

export const runtime = 'nodejs';

export async function GET() {
  const status = await getCaptureManager().getStatus();
  return NextResponse.json(status);
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    action?: 'start' | 'stop';
    interface?: string;
  };

  const manager = getCaptureManager();

  if (body.action === 'stop') {
    const status = await manager.stop();
    return NextResponse.json(status);
  }

  if (body.action === 'start') {
    const status = await manager.start(body.interface);
    return NextResponse.json(status, { status: status.error ? 400 : 200 });
  }

  return NextResponse.json({ error: 'Invalid action. Use "start" or "stop".' }, { status: 400 });
}