import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Clean existing data in dependency order
  await prisma.reservation.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();

  // Create warehouses
  const eastWarehouse = await prisma.warehouse.create({
    data: {
      name: 'East Coast Distribution Center',
      location: 'New York, NY',
    },
  });

  const westWarehouse = await prisma.warehouse.create({
    data: {
      name: 'West Coast Fulfillment',
      location: 'Los Angeles, CA',
    },
  });

  // Create products
  const headphones = await prisma.product.create({
    data: {
      name: 'Wireless Headphones',
      description: 'Noise-cancelling over-ear wireless headphones.',
      sku: 'WH-1000',
      price: 99.99,
    },
  });

  const keyboard = await prisma.product.create({
    data: {
      name: 'Mechanical Keyboard',
      description: 'Tenkeyless mechanical keyboard with brown switches.',
      sku: 'KB-87',
      price: 129.99,
    },
  });

  const mouse = await prisma.product.create({
    data: {
      name: 'Gaming Mouse',
      description: 'Ultra-lightweight wireless gaming mouse.',
      sku: 'MS-GPRO',
      price: 79.99,
    },
  });

  // Seed inventory
  const inventoryData = [
    { productId: headphones.id, warehouseId: eastWarehouse.id, totalStock: 10 },
    { productId: headphones.id, warehouseId: westWarehouse.id, totalStock: 5 },
    { productId: keyboard.id, warehouseId: eastWarehouse.id, totalStock: 8 },
    { productId: keyboard.id, warehouseId: westWarehouse.id, totalStock: 12 },
    { productId: mouse.id, warehouseId: eastWarehouse.id, totalStock: 15 },
    { productId: mouse.id, warehouseId: westWarehouse.id, totalStock: 20 },
  ];

  for (const item of inventoryData) {
    await prisma.inventory.create({
      data: {
        productId: item.productId,
        warehouseId: item.warehouseId,
        totalStock: item.totalStock,
        reservedStock: 0,
      },
    });
  }

  console.log('Seeding finished successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
