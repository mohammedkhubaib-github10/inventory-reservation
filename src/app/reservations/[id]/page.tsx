"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

interface Product {
  name: string;
  sku: string;
  price: string;
}

interface Warehouse {
  name: string;
  location: string;
}

interface Reservation {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  status: "PENDING" | "CONFIRMED" | "RELEASED";
  expiresAt: string;
  product: Product;
  warehouse: Warehouse;
}

export default function ReservationPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [timeLeft, setTimeLeft] = useState<string>("10:00");
  const [isExpired, setIsExpired] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch reservation details
  const fetchReservation = useCallback(async () => {
    try {
      const res = await fetch(`/api/reservations/${id}`);
      if (!res.ok) {
        if (res.status === 404) {
          setErrorMsg("Reservation not found.");
        } else {
          setErrorMsg("Failed to retrieve reservation details.");
        }
        return;
      }
      const data: Reservation = await res.json();
      setReservation(data);

      if (data.status === "CONFIRMED") {
        setIsExpired(false);
      } else if (data.status === "RELEASED") {
        setIsExpired(true);
      } else {
        // PENDING - check expiration
        const remaining = new Date(data.expiresAt).getTime() - Date.now();
        if (remaining <= 0) {
          setIsExpired(true);
        }
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchReservation();
  }, [id, fetchReservation]);

  // Countdown timer logic
  useEffect(() => {
    if (!reservation || reservation.status !== "PENDING" || isExpired) return;

    const updateTimer = () => {
      const expirationTime = new Date(reservation.expiresAt).getTime();
      const now = Date.now();
      const distance = expirationTime - now;

      if (distance <= 0) {
        setIsExpired(true);
        setTimeLeft("00:00");
        // Automatically check database status when local timer expires
        fetchReservation();
        return;
      }

      const minutes = Math.floor(distance / (60 * 1000));
      const seconds = Math.floor((distance % (60 * 1000)) / 1000);

      const mStr = minutes.toString().padStart(2, "0");
      const sStr = seconds.toString().padStart(2, "0");

      setTimeLeft(`${mStr}:${sStr}`);
    };

    updateTimer(); // run once immediately
    const timer = setInterval(updateTimer, 1000);

    return () => clearInterval(timer);
  }, [reservation, isExpired, fetchReservation]);

  const handleConfirm = async () => {
    setErrorMsg(null);
    setConfirming(true);

    try {
      const res = await fetch(`/api/reservations/${id}/confirm`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 410) {
          setErrorMsg("Payment Failed (410 Expired): Your 10-minute hold reservation expired before checkout completed. Stock has been returned to inventory.");
          setIsExpired(true);
          // Refetch to align status
          fetchReservation();
        } else {
          setErrorMsg(data.error || "Payment confirmation failed. Please retry.");
        }
        return;
      }

      // Success
      setReservation((prev) => prev ? { ...prev, status: "CONFIRMED" } : null);
    } catch (err) {
      console.error(err);
      setErrorMsg("Network failure during payment confirmation.");
    } finally {
      setConfirming(false);
    }
  };

  const handleRelease = async () => {
    setErrorMsg(null);
    setCancelling(true);

    try {
      const res = await fetch(`/api/reservations/${id}/release`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || "Cancellation failed.");
        return;
      }

      // Redirect back
      router.push("/");
    } catch (err) {
      console.error(err);
      setErrorMsg("Network error. Could not release reservation.");
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 flex flex-col items-center justify-center space-y-4">
        <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin"></div>
        <p className="text-gray-400">Loading reservation status...</p>
      </div>
    );
  }

  if (errorMsg && !reservation) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-6">
        <div className="glass p-8 rounded-2xl border border-red-500/20">
          <h2 className="text-2xl font-bold text-red-400 mb-2">Reservation Error</h2>
          <p className="text-gray-300 text-sm">{errorMsg}</p>
        </div>
        <Link href="/" className="inline-block bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-bold transition">
          Return to Catalog
        </Link>
      </div>
    );
  }

  if (!reservation) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      {/* Back Button */}
      <Link href="/" className="inline-flex items-center text-sm text-gray-400 hover:text-white mb-8 transition gap-2">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back to Catalog
      </Link>

      {/* Main Reservation Card */}
      <div className="glass rounded-3xl overflow-hidden shadow-2xl relative">
        
        {/* Card Header Status Indicator */}
        <div className={`px-6 py-4 text-center text-sm font-bold tracking-wider uppercase border-b border-gray-800/50 ${
          reservation.status === "CONFIRMED"
            ? "bg-green-950/40 text-green-400"
            : isExpired || reservation.status === "RELEASED"
            ? "bg-red-950/40 text-red-400"
            : "bg-yellow-950/30 text-yellow-400"
        }`}>
          {reservation.status === "CONFIRMED"
            ? "✓ Order Confirmed"
            : isExpired || reservation.status === "RELEASED"
            ? "✕ Reservation Expired / Released"
            : "⌛ Temp Reservation Hold"}
        </div>

        <div className="p-8 space-y-8">
          {/* Expired/Error notice banner */}
          {errorMsg && (
            <div className="p-4 bg-red-950/80 border border-red-500/30 text-red-200 rounded-2xl flex items-start space-x-3 shadow-lg">
              <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm font-medium">{errorMsg}</div>
            </div>
          )}

          {/* Checkout Countdown Timer Block */}
          {reservation.status === "PENDING" && !isExpired && (
            <div className="text-center bg-gray-900/40 rounded-2xl p-6 border border-gray-800">
              <p className="text-xs text-gray-500 font-semibold tracking-wider uppercase mb-1">Stock Reservation Expiraton</p>
              <div className="text-4xl md:text-5xl font-mono font-extrabold text-indigo-400 tracking-widest">
                {timeLeft}
              </div>
              <p className="text-xs text-gray-400 mt-2.5">
                Complete your checkout before the timer runs out to secure your items.
              </p>
            </div>
          )}

          {/* Details Grid */}
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-white border-b border-gray-800 pb-2">Checkout Details</h3>
            <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
              <div>
                <span className="text-gray-500 block">Item Name</span>
                <span className="text-white font-medium">{reservation.product.name}</span>
              </div>
              <div>
                <span className="text-gray-500 block">SKU Code</span>
                <span className="text-gray-300 font-mono">{reservation.product.sku}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Fulfillment Location</span>
                <span className="text-white font-medium">{reservation.warehouse.name}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Quantity Reserved</span>
                <span className="text-indigo-300 font-extrabold">{reservation.quantity} Unit(s)</span>
              </div>
              <div>
                <span className="text-gray-500 block">Reserved Price</span>
                <span className="text-indigo-400 font-semibold">
                  ${(parseFloat(reservation.product.price) * reservation.quantity).toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-gray-500 block">Reservation ID</span>
                <span className="text-gray-400 font-mono text-xs break-all">{reservation.id}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3 pt-4">
            {reservation.status === "PENDING" && !isExpired ? (
              <>
                <button
                  onClick={handleConfirm}
                  disabled={confirming}
                  className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-extrabold rounded-2xl active:scale-[0.98] transition flex justify-center items-center gap-2 shadow-lg shadow-indigo-500/20"
                >
                  {confirming ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Processing Order...
                    </>
                  ) : (
                    "Confirm Order & Pay"
                  )}
                </button>
                <button
                  onClick={handleRelease}
                  disabled={cancelling}
                  className="w-full py-3 border border-gray-700 hover:bg-gray-800/40 text-gray-300 font-bold rounded-2xl transition active:scale-[0.98]"
                >
                  {cancelling ? "Cancelling..." : "Cancel & Release Stock"}
                </button>
              </>
            ) : reservation.status === "CONFIRMED" ? (
              <div className="text-center p-6 bg-green-950/20 border border-green-500/20 rounded-2xl space-y-4">
                <div className="inline-flex w-12 h-12 rounded-full bg-green-500/10 text-green-400 items-center justify-center font-bold text-2xl">
                  ✓
                </div>
                <div>
                  <h4 className="text-green-300 font-bold text-lg">Purchase Complete</h4>
                  <p className="text-gray-400 text-sm mt-1">
                    Thank you! The inventory has been permanently locked for fulfillment, and payment was processed.
                  </p>
                </div>
                <Link
                  href="/"
                  className="inline-block bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition"
                >
                  Catalog Home
                </Link>
              </div>
            ) : (
              <div className="text-center p-6 bg-red-950/20 border border-red-500/20 rounded-2xl space-y-4">
                <div className="inline-flex w-12 h-12 rounded-full bg-red-500/10 text-red-400 items-center justify-center font-bold text-2xl">
                  ✕
                </div>
                <div>
                  <h4 className="text-red-300 font-bold text-lg">Reservation Expired</h4>
                  <p className="text-gray-400 text-sm mt-1">
                    This reservation is closed. The stock reservation has been released and inventory made available back in stock.
                  </p>
                </div>
                <Link
                  href="/"
                  className="inline-block bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition"
                >
                  Return to Catalog
                </Link>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
