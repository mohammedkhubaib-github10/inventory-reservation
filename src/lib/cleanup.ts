import { Prisma } from '@prisma/client';

export async function cleanupExpiredReservations(tx: Prisma.TransactionClient) {
  const now = new Date();
  const expiredReservations = await tx.reservation.findMany({
    where: {
      status: 'PENDING',
      expiresAt: {
        lte: now,
      },
    },
  });

  for (const res of expiredReservations) {
    // Lock inventory row to prevent concurrent modifications
    await tx.$executeRawUnsafe(
      `SELECT * FROM "Inventory" WHERE "productId" = $1 AND "warehouseId" = $2 FOR UPDATE`,
      res.productId,
      res.warehouseId
    );

    // Update inventory: decrement reservedStock, preventing negative reservedStock values
    const currentInventory = await tx.inventory.findUnique({
      where: {
        productId_warehouseId: {
          productId: res.productId,
          warehouseId: res.warehouseId,
        },
      },
    });

    if (currentInventory) {
      const newReservedStock = Math.max(0, currentInventory.reservedStock - res.quantity);
      await tx.inventory.update({
        where: {
          productId_warehouseId: {
            productId: res.productId,
            warehouseId: res.warehouseId,
          },
        },
        data: {
          reservedStock: newReservedStock,
        },
      });
    }

    // Update reservation status to RELEASED
    await tx.reservation.update({
      where: { id: res.id },
      data: { status: 'RELEASED' },
    });
  }

  return expiredReservations.length;
}
