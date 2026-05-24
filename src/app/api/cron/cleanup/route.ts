import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cleanupExpiredReservations } from '@/lib/cleanup';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    let count = 0;
    await prisma.$transaction(async (tx) => {
      count = await cleanupExpiredReservations(tx);
    }, {
      timeout: 20000,
    });
    return NextResponse.json({ success: true, releasedCount: count });
  } catch (error: unknown) {
    console.error('Error running cleanup GET:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    let count = 0;
    await prisma.$transaction(async (tx) => {
      count = await cleanupExpiredReservations(tx);
    }, {
      timeout: 20000,
    });
    return NextResponse.json({ success: true, releasedCount: count });
  } catch (error: unknown) {
    console.error('Error running cleanup POST:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
