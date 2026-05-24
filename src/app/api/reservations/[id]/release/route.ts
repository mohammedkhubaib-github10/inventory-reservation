import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json({ error: 'Reservation ID is required' }, { status: 400 });
    }

    const transactionResult = await prisma.$transaction(async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const reservations = await tx.$queryRawUnsafe<any[]>(
        `SELECT * FROM "Reservation" WHERE "id" = $1 FOR UPDATE`,
        id
      );

      if (!reservations || reservations.length === 0) {
        return { success: false, status: 404, message: 'Reservation not found' };
      }

      const reservation = reservations[0];

      // 2. Handle repeated requests / idempotency
      if (reservation.status === 'RELEASED') {
        return { success: true, status: 200, reservation, message: 'Reservation already released' };
      }

      if (reservation.status === 'CONFIRMED') {
        return { success: false, status: 400, message: 'Cannot release a confirmed reservation.' };
      }

      // 3. Lock and update Inventory
      await tx.$executeRawUnsafe(
        `SELECT * FROM "Inventory" WHERE "productId" = $1 AND "warehouseId" = $2 FOR UPDATE`,
        reservation.productId,
        reservation.warehouseId
      );

      const currentInventory = await tx.inventory.findUnique({
        where: {
          productId_warehouseId: {
            productId: reservation.productId,
            warehouseId: reservation.warehouseId,
          },
        },
      });

      if (currentInventory) {
        const newReservedStock = Math.max(0, currentInventory.reservedStock - reservation.quantity);
        await tx.inventory.update({
          where: {
            productId_warehouseId: {
              productId: reservation.productId,
              warehouseId: reservation.warehouseId,
            },
          },
          data: {
            reservedStock: newReservedStock,
          },
        });
      }

      // 4. Update Reservation status to RELEASED
      const releasedReservation = await tx.reservation.update({
        where: { id },
        data: { status: 'RELEASED' },
      });

      return { success: true, status: 200, reservation: releasedReservation };
    }, {
      timeout: 10000,
    });

    if (!transactionResult.success) {
      return NextResponse.json(
        { error: transactionResult.message },
        { status: transactionResult.status }
      );
    }

    return NextResponse.json(transactionResult.reservation);
  } catch (error: unknown) {
    console.error('Error releasing reservation:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
