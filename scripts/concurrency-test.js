/**
 * Concurrency Test Script for Inventory Reservation
 * 
 * Fires two simultaneous requests for the exact same stock to verify
 * that exactly one succeeds (201) and the other receives a 409 Conflict.
 * 
 * Usage: node scripts/concurrency-test.js [baseURL] [productId] [warehouseId] [quantity]
 */

const baseURL = process.argv[2] || 'http://localhost:3000';
const productId = process.argv[3];
const warehouseId = process.argv[4];
const quantity = parseInt(process.argv[5] || '1', 10);

if (!productId || !warehouseId) {
  console.error('Error: Please provide productId and warehouseId.');
  console.log('Usage: node scripts/concurrency-test.js <baseURL> <productId> <warehouseId> <quantity>');
  console.log('Example: node scripts/concurrency-test.js http://localhost:3000 prod-id-123 wh-id-456 1');
  process.exit(1);
}

console.log(`Starting concurrency test...`);
console.log(`Target URL: ${baseURL}/api/reservations`);
console.log(`Product ID: ${productId}`);
console.log(`Warehouse ID: ${warehouseId}`);
console.log(`Quantity: ${quantity}`);
console.log('Firing parallel requests...\n');

async function runTest() {
  const payload = {
    productId,
    warehouseId,
    quantity
  };

  const startTime = Date.now();
  
  // Fire requests simultaneously
  const req1 = fetch(`${baseURL}/api/reservations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const req2 = fetch(`${baseURL}/api/reservations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const [res1, res2] = await Promise.all([req1, req2]);
  const endTime = Date.now();
  const timeTaken = endTime - startTime;

  console.log(`Both requests finished in ${timeTaken}ms.`);

  const status1 = res1.status;
  const status2 = res2.status;

  const data1 = await res1.json();
  const data2 = await res2.json();

  console.log(`\nRequest 1 Result:`);
  console.log(`- Status: ${status1}`);
  console.log(`- Response:`, data1);

  console.log(`\nRequest 2 Result:`);
  console.log(`- Status: ${status2}`);
  console.log(`- Response:`, data2);

  console.log(`\n--- ANALYSIS ---`);
  if ((status1 === 201 && status2 === 409) || (status1 === 409 && status2 === 201)) {
    console.log('✅ SUCCESS: Exactly one request succeeded (201) and the other was rejected (409). Concurrency locking behaves correctly!');
  } else if (status1 === 201 && status2 === 201) {
    console.log('❌ FAILURE: Both requests succeeded (201). Double-sell/oversell bug detected!');
  } else if (status1 === 409 && status2 === 409) {
    console.log('ℹ️ NOTICE: Both requests failed with 409. This is expected if there was insufficient stock to satisfy either request.');
  } else {
    console.log('⚠️ UNEXPECTED RESULT: Check the status codes and responses above.');
  }
}

runTest().catch(console.error);
