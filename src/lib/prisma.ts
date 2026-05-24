import { PrismaClient } from '@prisma/client';

async function seedDatabaseIfNeeded(client: PrismaClient) {
  try {
    const productCount = await client.product.count();
    if (productCount === 0) {
      console.log('🌱 Database is empty. Running programmatic seed...');

      // Create warehouses
      const eastWarehouse = await client.warehouse.create({
        data: {
          name: 'East Coast Distribution Center',
          location: 'New York, NY',
        },
      });

      const westWarehouse = await client.warehouse.create({
        data: {
          name: 'West Coast Fulfillment',
          location: 'Los Angeles, CA',
        },
      });

      // Create products
      const headphones = await client.product.create({
        data: {
          name: 'Wireless Headphones',
          description: 'Noise-cancelling over-ear wireless headphones.',
          sku: 'WH-1000',
          price: 99.99,
        },
      });

      const keyboard = await client.product.create({
        data: {
          name: 'Mechanical Keyboard',
          description: 'Tenkeyless mechanical keyboard with brown switches.',
          sku: 'KB-87',
          price: 129.99,
        },
      });

      const mouse = await client.product.create({
        data: {
          name: 'Gaming Mouse',
          description: 'Ultra-lightweight wireless gaming mouse.',
          sku: 'MS-GPRO',
          price: 79.99,
        },
      });

      // Mappings
      const inventoryData = [
        { productId: headphones.id, warehouseId: eastWarehouse.id, totalStock: 10 },
        { productId: headphones.id, warehouseId: westWarehouse.id, totalStock: 5 },
        { productId: keyboard.id, warehouseId: eastWarehouse.id, totalStock: 8 },
        { productId: keyboard.id, warehouseId: westWarehouse.id, totalStock: 12 },
        { productId: mouse.id, warehouseId: eastWarehouse.id, totalStock: 15 },
        { productId: mouse.id, warehouseId: westWarehouse.id, totalStock: 20 },
      ];

      for (const item of inventoryData) {
        await client.inventory.create({
          data: {
            productId: item.productId,
            warehouseId: item.warehouseId,
            totalStock: item.totalStock,
            reservedStock: 0,
          },
        });
      }

      console.log('✅ Programmatic seeding completed successfully!');
    }
  } catch (error) {
    // If tables don't exist yet, catch silently so it doesn't block server startup
    console.log('⏳ Skipping seeding (database tables not initialized yet).');
  }
}

const prismaClientSingleton = () => {
  const client = new PrismaClient();
  // Automatically trigger seeding on boot asynchronously
  seedDatabaseIfNeeded(client);
  return client;
};

/* eslint-disable no-var */
declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>;
}
/* eslint-enable no-var */

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

export default prisma;

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;
