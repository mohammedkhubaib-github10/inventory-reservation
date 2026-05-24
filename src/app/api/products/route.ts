import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cleanupExpiredReservations } from '@/lib/cleanup';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Run lazy cleanup of expired reservations inside a transaction before reading stock
    await prisma.$transaction(async (tx) => {
      await cleanupExpiredReservations(tx);
    }, {
      timeout: 10000,
    });

    // 2. Fetch warehouses with inventory and product details
    const warehouses = await prisma.warehouse.findMany({
      include: {
        inventories: {
          include: {
            product: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    // 3. Format the result
    const result = warehouses.map((w) => ({
      id: w.id,
      name: w.name,
      location: w.location,
      products: w.inventories.map((inv) => ({
        id: inv.product.id,
        name: inv.product.name,
        sku: inv.product.sku,
        price: inv.product.price,
        totalStock: inv.totalStock,
        reservedStock: inv.reservedStock,
        availableStock: Math.max(0, inv.totalStock - inv.reservedStock),
      })),
    }));

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Error fetching products:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
