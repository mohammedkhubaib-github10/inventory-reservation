# Concurrent Inventory Reservation System

This is a clean, production-grade inventory reservation system built with Next.js App Router, TypeScript, Prisma, and Supabase PostgreSQL. It enforces strict concurrency control to prevent inventory overselling during high-traffic checkout events.

## Key Features
- **Concurrency-Safe Checkout**: Guarantees that if two customers attempt to reserve the last unit of stock, exactly one request succeeds and the other receives a `409 Conflict` response.
- **PostgreSQL Row-Level Locking**: Employs Postgres native transactions (`FOR UPDATE` row locking) for data consistency instead of fragile in-memory locking.
- **Dynamic 10-Minute Lock**: Temporarily reserves stock for checkout. A live countdown timer updates client status.
- **Lazy Expiry Cleanup**: Expired locks are released automatically during stock queries and checkout requests, ensuring stock is never "leaked" or held indefinitely.
- **Premium Interface**: A modern dark-themed dashboard showing live inventory levels (Total, Reserved, and Available Stock).

---

##Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Database ORM**: Prisma Client
- **Database**: Supabase PostgreSQL
- **Validation**: Zod (Server-side schema validation)
- **Styling**: TailwindCSS v3

---
## Expiry Cleanup Strategy

When a customer leaves their cart open or a payment fails, their reserved stock must return to the active inventory pool. We use a **hybrid cleanup strategy**:

1. **Lazy Cleanup**: Whenever a user reads the product catalog (`GET /api/products`) or attempts to reserve stock (`POST /api/reservations`), a cleanup function runs first inside the transaction. It releases all pending reservations where `expiresAt <= NOW()`.
2. **Background Cron**: A dedicated endpoint `GET/POST /api/cron/cleanup` is available. You can register this URL in **Vercel Cron** to run every 1–5 minutes to batch-release expired locks.

---

## Architectural Tradeoffs

### 1. Postgres Row-Level Locks vs. Redis Distributed Locking (Redlock)
- **Redis (Redlock)**: Extremely fast in-memory locking. However, it introduces another moving piece to host, configure, pay for, and sync with the primary DB.
- **Postgres row-level locking (Chosen)**: Simpler architecture. Leveraging PostgreSQL ACID guarantees means zero out-of-sync drift.
- **Tradeoff**: Postgres locks hold connection slots. Under extreme concurrent checkout loads (e.g., thousands of requests per second on a single product), this can exhaust DB connections. To mitigate this, we set a strict **10-second transaction timeout** in Prisma to prevent deadlocks.

##  Database Schema

Our database contains four tables with relations:

- **`Product`**: Catalog of items (SKU, Name, Price).
- **`Warehouse`**: Distribution nodes.
- **`Inventory`**: Maps `Product` to `Warehouse`. Holds `totalStock` and `reservedStock` (where `availableStock = totalStock - reservedStock`).
- **`Reservation`**: Holds transaction items, status (`PENDING`, `CONFIRMED`, `RELEASED`), quantity, and `expiresAt` timestamps.

---


---

##  Verifying Concurrency Correctness

A script has been provided to test database lock safety under simultaneous requests.

1. Ensure the app is running locally (`npm run dev`).
2. Fetch a valid `productId` and `warehouseId` (e.g., from the dashboard or your Supabase console).
3. Run the script:
```bash
node scripts/concurrency-test.js http://localhost:3000 <PRODUCT_ID> <WAREHOUSE_ID> <QUANTITY>
```

The script will fire two parallel checkout requests. The locking mechanism will serialize them:
- **Request 1**: Succeeds with **`201 Created`**.
- **Request 2**: Blocked until Request 1 finishes, then fails with **`409 Conflict`** (due to stock decrement).

---
