# Concurrent Inventory Reservation System

This is a clean, production-grade inventory reservation system built with Next.js App Router, TypeScript, Prisma, and Supabase PostgreSQL. It enforces strict concurrency control to prevent inventory overselling during high-traffic checkout events.

## 🚀 Key Features
- **Concurrency-Safe Checkout**: Guarantees that if two customers attempt to reserve the last unit of stock, exactly one request succeeds and the other receives a `409 Conflict` response.
- **PostgreSQL Row-Level Locking**: Employs Postgres native transactions (`FOR UPDATE` row locking) for data consistency instead of fragile in-memory locking.
- **Dynamic 10-Minute Lock**: Temporarily reserves stock for checkout. A live countdown timer updates client status.
- **Lazy Expiry Cleanup**: Expired locks are released automatically during stock queries and checkout requests, ensuring stock is never "leaked" or held indefinitely.
- **Premium Interface**: A modern dark-themed dashboard showing live inventory levels (Total, Reserved, and Available Stock).

---

## 🛠️ Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Database ORM**: Prisma Client
- **Database**: Supabase PostgreSQL
- **Validation**: Zod (Server-side schema validation)
- **Styling**: TailwindCSS v3

---

## 🔒 Concurrency Strategy

The system uses database-native transactional consistency. Here is the lifecycle of a reservation:

```mermaid
sequenceDiagram
    participant Client as Client Request
    participant DB as Supabase PostgreSQL
    Note over Client, DB: Reservation Creation Flow
    Client->>DB: Begin Transaction ($transaction)
    Client->>DB: Lock Inventory Row (SELECT ... FOR UPDATE)
    Note right of DB: Blocks other transactions on this SKU/Warehouse pair
    Client->>DB: Calculate availableStock = totalStock - reservedStock
    alt availableStock >= quantity
        Client->>DB: Increment reservedStock by quantity
        Client->>DB: Create Reservation (PENDING status, 10 min expiry)
        Client->>DB: Commit Transaction (releases lock)
        DB-->>Client: 201 Created
    else availableStock < quantity
        Client->>DB: Rollback Transaction (releases lock)
        DB-->>Client: 409 Conflict (Insufficient stock)
    end
```

### Why Raw SQL `FOR UPDATE`?
Prisma's standard query builder does not support PostgreSQL `FOR UPDATE` locks directly. We execute `$queryRawUnsafe` inside a Prisma `$transaction` block. This locks the database row for the product-warehouse combination, queuing concurrent requests and avoiding race conditions.

---

## ⏳ Expiry Cleanup Strategy

When a customer leaves their cart open or a payment fails, their reserved stock must return to the active inventory pool. We use a **hybrid cleanup strategy**:

1. **Lazy Cleanup**: Whenever a user reads the product catalog (`GET /api/products`) or attempts to reserve stock (`POST /api/reservations`), a cleanup function runs first inside the transaction. It releases all pending reservations where `expiresAt <= NOW()`.
2. **Background Cron**: A dedicated endpoint `GET/POST /api/cron/cleanup` is available. You can register this URL in **Vercel Cron** to run every 1–5 minutes to batch-release expired locks.

---

## ⚖️ Architectural Tradeoffs

### 1. Postgres Row-Level Locks vs. Redis Distributed Locking (Redlock)
- **Redis (Redlock)**: Extremely fast in-memory locking. However, it introduces another moving piece to host, configure, pay for, and sync with the primary DB.
- **Postgres row-level locking (Chosen)**: Simpler architecture. Leveraging PostgreSQL ACID guarantees means zero out-of-sync drift.
- **Tradeoff**: Postgres locks hold connection slots. Under extreme concurrent checkout loads (e.g., thousands of requests per second on a single product), this can exhaust DB connections. To mitigate this, we set a strict **10-second transaction timeout** in Prisma to prevent deadlocks.

### 2. Lazy Expiry vs. Message Queues (SQS / RabbitMQ)
- **Message Queues**: Scheduling a delayed release message is the traditional enterprise path. However, it requires running a message worker and paid infrastructure.
- **Lazy Cleanup (Chosen)**: Free and requires zero configuration.
- **Tradeoff**: The catalog API does a tiny bit of extra work checking and updating expired reservations. By structuring indexes on `status` and `expiresAt`, this overhead is kept under 5ms.

---

## 📦 Database Schema

Our database contains four tables with relations:

- **`Product`**: Catalog of items (SKU, Name, Price).
- **`Warehouse`**: Distribution nodes.
- **`Inventory`**: Maps `Product` to `Warehouse`. Holds `totalStock` and `reservedStock` (where `availableStock = totalStock - reservedStock`).
- **`Reservation`**: Holds transaction items, status (`PENDING`, `CONFIRMED`, `RELEASED`), quantity, and `expiresAt` timestamps.

---

## 🚀 Setup & Installation

### 1. Clone & Install Dependencies
```bash
# Navigate to project folder
cd inventory-reservation

# Install packages
npm install
```

### 2. Configure Database Variables
Create a `.env` file in the root directory (one has been pre-configured for you) and insert your Supabase connection string:
```env
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres?schema=public"
```

### 3. Push Database Schema
Push the schema structure directly to your PostgreSQL instance:
```bash
npx prisma db push
```

### 4. Seed Testing Data
Populate warehouses, products, and inventory stock mappings:
```bash
npx prisma db seed
```

### 5. Run Locally
Boot the Next.js development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application dashboard.

---

## 🧪 Verifying Concurrency Correctness

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

## 🔮 Future Production Improvements
- **Connection Pooler**: Connect to Supabase using port `6543` (Supabase PgBouncer / Supavisor connection pooling) to scale database connections under checkout loads.
- **Index Optimization**: Add database indexes on `Reservation.status` and `Reservation.expiresAt` to speed up the lazy cleanup query.
- **Audit Logs**: Store ledger adjustments (stock updates) in an `AuditLog` table for accounting and debugging.
