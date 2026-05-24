import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { cleanupExpiredReservations } from '@/lib/cleanup';

const CreateReservationSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  warehouseId: z.string().min(1, 'Warehouse ID is required'),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = CreateReservationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Bad Request', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { productId, warehouseId, quantity } = parsed.data;

    // Use transaction with row-level locking
    const transactionResult = await prisma.$transaction(async (tx) => {
      // 1. Run lazy cleanup of expired reservations first so expired stock is freed
      await cleanupExpiredReservations(tx);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inventories = await tx.$queryRawUnsafe<any[]>(
        `SELECT * FROM "Inventory" WHERE "productId" = $1 AND "warehouseId" = $2 FOR UPDATE`,
        productId,
        warehouseId
      );

      if (!inventories || inventories.length === 0) {
        return { success: false, status: 404, message: 'Product is not stocked in this warehouse.' };
      }

      const inventory = inventories[0];
      const availableStock = inventory.totalStock - inventory.reservedStock;

      if (availableStock < quantity) {
        return { success: false, status: 409, message: 'Insufficient stock available.' };
      }

      // 3. Update inventory reservedStock
      await tx.inventory.update({
        where: {
          productId_warehouseId: {
            productId,
            warehouseId,
          },
        },
        data: {
          reservedStock: {
            increment: quantity,
          },
        },
      });

      // 4. Create the pending reservation
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // Now + 10 minutes
      const reservation = await tx.reservation.create({
        data: {
          productId,
          warehouseId,
          quantity,
          status: 'PENDING',
          expiresAt,
        },
      });

      return { success: true, status: 201, reservation };
    }, {
      timeout: 10000, // 10 seconds timeout to prevent deadlocks under load
    });

    if (!transactionResult.success) {
      return NextResponse.json(
        { error: transactionResult.message },
        { status: transactionResult.status }
      );
    }

    return NextResponse.json(transactionResult.reservation, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating reservation:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
