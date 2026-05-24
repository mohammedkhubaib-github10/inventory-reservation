"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Product {
  id: string;
  name: string;
  sku: string;
  price: string;
  totalStock: number;
  reservedStock: number;
  availableStock: number;
}

interface Warehouse {
  id: string;
  name: string;
  location: string;
  products: Product[];
}

export default function ProductsPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [reservingId, setReservingId] = useState<string | null>(null); // productId_warehouseId
  const [quantities, setQuantities] = useState<Record<string, number>>({}); // key: productId_warehouseId
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const router = useRouter();

  // Fetch products and warehouses
  const loadData = async () => {
    try {
      const res = await fetch("/api/products");
      if (!res.ok) {
        throw new Error("Failed to load products");
      }
      const data = await res.json();
      setWarehouses(data);
      
      // Initialize default quantities
      const initialQuantities: Record<string, number> = {};
      data.forEach((w: Warehouse) => {
        w.products.forEach((p: Product) => {
          initialQuantities[`${p.id}_${w.id}`] = 1;
        });
      });
      setQuantities((prev) => ({ ...initialQuantities, ...prev }));
    } catch (err: unknown) {
      console.error(err);
      setErrorMsg("Unable to retrieve catalog data. Check your database connection.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Poll for updates every 5 seconds to keep stock in sync
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleQuantityChange = (productId: string, warehouseId: string, val: number, max: number) => {
    const key = `${productId}_${warehouseId}`;
    const cleanVal = Math.max(1, Math.min(max, val));
    setQuantities((prev) => ({
      ...prev,
      [key]: cleanVal,
    }));
  };

  const handleReserve = async (productId: string, warehouseId: string) => {
    const key = `${productId}_${warehouseId}`;
    const qty = quantities[key] || 1;
    setErrorMsg(null);
    setReservingId(key);

    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productId,
          warehouseId,
          quantity: qty,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          setErrorMsg(
            `Reservation Failed (409 Conflict): The requested quantity (${qty}) exceeds the available stock. Someone else might have just checked out.`
          );
          // Instantly refresh stock listing
          loadData();
        } else {
          setErrorMsg(data.error || "An unexpected error occurred during reservation.");
        }
        return;
      }

      // Success - Redirect to reservation checkout page
      router.push(`/reservations/${data.id}`);
    } catch (err: unknown) {
      console.error(err);
      setErrorMsg("Network error. Please check your connection.");
    } finally {
      setReservingId(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <header className="mb-12 text-center">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-4">
          Apex Inventory Portal
        </h1>
        <p className="text-gray-400 text-lg max-w-2xl mx-auto">
          Manage warehouse distributions and reserve items securely. Stock is temporarily locked for 10 minutes at checkout.
        </p>
      </header>

      {/* Error Alert Display */}
      {errorMsg && (
        <div className="mb-8 p-4 bg-red-950/80 border border-red-500/30 text-red-200 rounded-xl flex items-start space-x-3 shadow-lg animate-pulse">
          <svg className="w-6 h-6 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <h3 className="font-bold text-red-300">Transaction Notice</h3>
            <p className="text-sm mt-1">{errorMsg}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin"></div>
          <p className="text-gray-400 animate-pulse">Synchronizing database inventory...</p>
        </div>
      ) : (
        <div className="space-y-12">
          {warehouses.length === 0 ? (
            <div className="glass p-8 rounded-2xl text-center text-gray-400">
              No warehouses found. Please run the database seeding script to insert sample data.
            </div>
          ) : (
            warehouses.map((warehouse) => (
              <section key={warehouse.id} className="space-y-4">
                <div className="flex items-baseline space-x-2 border-b border-gray-800 pb-2">
                  <h2 className="text-2xl font-bold text-white">{warehouse.name}</h2>
                  <span className="text-sm text-indigo-400 font-medium">({warehouse.location})</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {warehouse.products.length === 0 ? (
                    <div className="col-span-full glass p-6 rounded-2xl text-gray-500 text-center">
                      No products mapped to this warehouse.
                    </div>
                  ) : (
                    warehouse.products.map((product) => {
                      const qtyKey = `${product.id}_${warehouse.id}`;
                      const selectedQty = quantities[qtyKey] || 1;
                      const isOutOfStock = product.availableStock <= 0;
                      const isReserving = reservingId === qtyKey;

                      return (
                        <div
                          key={product.id}
                          className="glass glass-hover p-6 rounded-2xl flex flex-col justify-between transition duration-300"
                        >
                          <div>
                            {/* Product Title and SKU */}
                            <div className="flex justify-between items-start mb-2">
                              <h3 className="text-lg font-bold text-white">{product.name}</h3>
                              <span className="text-xs bg-gray-800 text-gray-400 px-2.5 py-1 rounded-md font-mono">
                                {product.sku}
                              </span>
                            </div>
                            
                            {/* Price */}
                            <p className="text-indigo-400 font-semibold text-xl mb-4">
                              ${parseFloat(product.price).toFixed(2)}
                            </p>

                            {/* Stock Indicator Pills */}
                            <div className="grid grid-cols-3 gap-2 mb-6">
                              <div className="bg-gray-900/60 p-2 rounded-xl text-center">
                                <div className="text-xs text-gray-500">Total</div>
                                <div className="text-sm font-bold text-gray-300">{product.totalStock}</div>
                              </div>
                              <div className="bg-gray-900/60 p-2 rounded-xl text-center">
                                <div className="text-xs text-gray-500">Reserved</div>
                                <div className="text-sm font-bold text-yellow-500/80">{product.reservedStock}</div>
                              </div>
                              <div className={`p-2 rounded-xl text-center ${isOutOfStock ? "bg-red-950/40" : "bg-green-950/30"}`}>
                                <div className="text-xs text-gray-500">Available</div>
                                <div className={`text-sm font-extrabold ${isOutOfStock ? "text-red-400" : "text-green-400"}`}>
                                  {product.availableStock}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Purchase / Reservation Row */}
                          <div className="space-y-3 mt-4">
                            {!isOutOfStock && (
                              <div className="flex items-center justify-between bg-gray-900/50 rounded-xl p-1.5 border border-gray-800">
                                <span className="text-xs text-gray-400 pl-2 font-medium">Quantity</span>
                                <div className="flex items-center space-x-1">
                                  <button
                                    onClick={() => handleQuantityChange(product.id, warehouse.id, selectedQty - 1, product.availableStock)}
                                    className="w-8 h-8 rounded-lg bg-gray-800 text-gray-300 flex items-center justify-center hover:bg-gray-700 transition"
                                  >
                                    -
                                  </button>
                                  <input
                                    type="number"
                                    value={selectedQty}
                                    onChange={(e) => handleQuantityChange(product.id, warehouse.id, parseInt(e.target.value) || 1, product.availableStock)}
                                    className="w-12 text-center bg-transparent border-0 focus:ring-0 text-sm font-bold text-white focus:outline-none"
                                  />
                                  <button
                                    onClick={() => handleQuantityChange(product.id, warehouse.id, selectedQty + 1, product.availableStock)}
                                    className="w-8 h-8 rounded-lg bg-gray-800 text-gray-300 flex items-center justify-center hover:bg-gray-700 transition"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            )}

                            <button
                              onClick={() => handleReserve(product.id, warehouse.id)}
                              disabled={isOutOfStock || isReserving}
                              className={`w-full py-3 px-4 rounded-xl font-bold flex justify-center items-center gap-2 transition duration-200 ${
                                isOutOfStock
                                  ? "bg-gray-900 text-gray-600 border border-gray-800 cursor-not-allowed"
                                  : isReserving
                                  ? "bg-indigo-600/50 text-white cursor-wait"
                                  : "bg-indigo-600 hover:bg-indigo-500 text-white active:scale-95 shadow-md shadow-indigo-600/20"
                              }`}
                            >
                              {isReserving ? (
                                <>
                                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                  Locking Stock...
                                </>
                              ) : isOutOfStock ? (
                                "Out of Stock"
                              ) : (
                                "Reserve & Checkout"
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            ))
          )}
        </div>
      )}
    </div>
  );
}
