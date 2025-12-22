import { useState, useMemo } from "react";
import visa from "../assets/cc/visa.svg";
import mastercard from "../assets/cc/mastercard.svg";
import amex from "../assets/cc/amex.svg";
import discover from "../assets/cc/discover.svg";

export default function CheckoutModal({
  isOpen,
  onClose,
  subtotal,
  taxRate,
  onCompletePayment,
}) {
  const [paymentType, setPaymentType] = useState(null);
  const [cardType, setCardType] = useState(null);
  const [discountPercent, setDiscountPercent] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");

  const cardOptions = useMemo(
    () => [
      { type: "Visa", img: visa },
      { type: "Mastercard", img: mastercard },
      { type: "Amex", img: amex },
      { type: "Discover", img: discover },
    ],
    []
  );

  /* ================= TOTAL CALCS (UNCHANGED) ================= */
  const totals = useMemo(() => {
    let discount = 0;

    if (discountPercent) {
      discount = (subtotal * Number(discountPercent)) / 100;
    } else if (discountAmount) {
      discount = Number(discountAmount);
    }

    const discountedSubtotal = Math.max(subtotal - discount, 0);
    const tax = discountedSubtotal * taxRate;
    const total = discountedSubtotal + tax;

    return {
      discount,
      discountedSubtotal,
      tax,
      total,
    };
  }, [subtotal, discountPercent, discountAmount, taxRate]);

  if (!isOpen) return null;

  /* ================= COMPLETE PAYMENT (FIXED) ================= */
  const completePayment = () => {
    onCompletePayment({
      /* ✅ PAYMENT OBJECT (RECEIPT-SAFE) */
      payment: {
        method:
          paymentType === "Credit" || paymentType === "Debit"
            ? cardType || paymentType
            : paymentType,
        type: paymentType,
        cardType: cardType || null,
      },

      /* ✅ TOTALS OBJECT (RECEIPT-SAFE) */
      totals: {
        subtotal,
        tax: totals.tax,
        total: totals.total,
        discount: discountAmount ? Number(discountAmount) : null,
        discountPercent: discountPercent ? Number(discountPercent) : null,
      },
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40">
      <div className="relative bg-white w-full max-w-md rounded-xl p-5 space-y-4 shadow-xl">

        {/* CLOSE */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 text-xl"
          aria-label="Close checkout"
        >
          ✕
        </button>

        <h2 className="text-lg font-semibold">💳 Payment</h2>

        {/* PAYMENT TYPE */}
        <div>
          <div className="text-sm font-semibold mb-1">Payment Type</div>
          <div className="grid grid-cols-2 gap-2">
            {[
              "Cash",
              "Credit",
              "Debit",
              "Check",
              "Gift Card",
              "Store Credit",
            ].map((type) => (
              <button
                key={type}
                onClick={() => {
                  setPaymentType(type);
                  if (type !== "Credit") setCardType(null);
                }}
                className={`py-2 rounded-lg text-sm transition ${
                  paymentType === type
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 hover:bg-gray-200"
                }`}
              >
                {type === "Cash" && "💵 "}
                {type === "Credit" && "💳 "}
                {type === "Debit" && "🏦 "}
                {type === "Check" && "🧾 "}
                {type === "Gift Card" && "🎁 "}
                {type === "Store Credit" && "🏪 "}
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* CARD TYPE */}
        {paymentType === "Credit" && (
          <div>
            <div className="text-sm font-semibold mb-1">Card Type</div>
            <div className="grid grid-cols-2 gap-3">
              {cardOptions.map((c) => (
                <button
                  key={c.type}
                  onClick={() => setCardType(c.type)}
                  className={`border rounded-lg p-3 flex items-center gap-3 transition ${
                    cardType === c.type
                      ? "ring-2 ring-blue-600 bg-blue-50"
                      : "bg-white hover:bg-gray-50"
                  }`}
                >
                  <img src={c.img} alt={c.type} className="h-7 w-auto" />
                  <span className="text-sm font-medium">{c.type}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* DISCOUNTS */}
        <div className="grid grid-cols-2 gap-2">
          <input
            placeholder="% Discount"
            value={discountPercent}
            onChange={(e) => {
              setDiscountPercent(e.target.value);
              setDiscountAmount("");
            }}
            className="border rounded px-3 py-2 text-sm"
          />
          <input
            placeholder="$ Discount"
            value={discountAmount}
            onChange={(e) => {
              setDiscountAmount(e.target.value);
              setDiscountPercent("");
            }}
            className="border rounded px-3 py-2 text-sm"
          />
        </div>

        {/* TOTALS */}
        <div className="border-t pt-2 space-y-1 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Tax</span>
            <span>${totals.tax.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-semibold text-base">
            <span>Total</span>
            <span>${totals.total.toFixed(2)}</span>
          </div>
        </div>

        {/* CONFIRM */}
        <button
          onClick={completePayment}
          disabled={
            !paymentType || (paymentType === "Credit" && !cardType)
          }
          className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold disabled:opacity-60"
        >
          ✅ Complete Payment
        </button>

        {/* CANCEL */}
        <button
          onClick={onClose}
          className="w-full border py-2 rounded-lg text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>

      </div>
    </div>
  );
}
