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

      // 2. Check current status
      if (reservation.status === 'CONFIRMED') {
        return { success: true, status: 200, reservation, message: 'Reservation already confirmed' };
      }

      if (reservation.status === 'RELEASED') {
        return { success: false, status: 410, message: 'Reservation already released or expired' };
      }

      // 3. Check expiration
      const now = new Date();
      if (new Date(reservation.expiresAt) < now) {
        // Reservation expired, so we must release it
        await tx.reservation.update({
          where: { id },
          data: { status: 'RELEASED' },
        });

        // Lock inventory and decrement reservedStock
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

        return { success: false, status: 410, message: 'Reservation has expired' };
      }

      // 4. Confirm Reservation: Lock and update Inventory
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

      if (!currentInventory) {
        return { success: false, status: 404, message: 'Inventory record not found' };
      }

      const newTotalStock = Math.max(0, currentInventory.totalStock - reservation.quantity);
      const newReservedStock = Math.max(0, currentInventory.reservedStock - reservation.quantity);

      await tx.inventory.update({
        where: {
          productId_warehouseId: {
            productId: reservation.productId,
            warehouseId: reservation.warehouseId,
          },
        },
        data: {
          totalStock: newTotalStock,
          reservedStock: newReservedStock,
        },
      });

      // 5. Update Reservation status to CONFIRMED
      const confirmedReservation = await tx.reservation.update({
        where: { id },
        data: { status: 'CONFIRMED' },
      });

      return { success: true, status: 200, reservation: confirmedReservation };
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
    console.error('Error confirming reservation:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
