import { useEffect, useState } from "react";
import "./ReceiptPrint.css";

export default function ReceiptPrint() {
  const [receipt, setReceipt] = useState(null);
  const [logo, setLogo] = useState(null);

  /* ================= LOAD DATA ================= */
  useEffect(() => {
    const r = localStorage.getItem("currentReceipt");
    if (r) setReceipt(JSON.parse(r));

    const l = localStorage.getItem("receiptLogo");
    if (l) setLogo(l);
  }, []);

  if (!receipt) return <div className="p-6">No receipt data.</div>;

  /* ================= NORMALIZE ITEMS ================= */
  const items =
    receipt.items ||
    receipt.cartItems ||
    receipt.products ||
    [];

  /* ================= NORMALIZE TOTALS ================= */
  const totals = receipt.totals || {};

  let subtotal =
    receipt.subtotal ??
    totals.subtotal ??
    items.reduce((sum, i) => sum + (i.price || 0) * (i.qty || 1), 0);

  let tax =
    receipt.tax ??
    totals.tax ??
    0;

  let total =
    receipt.total ??
    totals.total ??
    subtotal + tax;

  /* ================= DISCOUNT DETECTION ================= */
  let discountAmount = 0;
  let discountLabel = null;

  if (totals.discountPercent) {
    discountAmount = subtotal * (totals.discountPercent / 100);
    discountLabel = `${totals.discountPercent}% Discount`;
  } else if (totals.discount) {
    discountAmount = totals.discount;
    discountLabel = "Discount";
  }

  if (!discountAmount && items.length) {
    items.forEach((i) => {
      if (i.discountPercent) {
        discountAmount += (i.price * i.qty) * (i.discountPercent / 100);
        discountLabel = "Item Discount";
      } else if (i.discount) {
        discountAmount += i.discount;
        discountLabel = "Item Discount";
      }
    });
  }

  const discountedSubtotal = subtotal - discountAmount;
  const finalTotal = discountedSubtotal + tax;

  /* ================= PAYMENT DETECTION ================= */
  let paymentMethod = "—";
  let last4 = null;

  const p = receipt.payment;

  if (p) {
    if (p.method) paymentMethod = p.method;
    else if (p.type) paymentMethod = p.type;
    else if (p.label) paymentMethod = p.label;
    else if (p.cash) paymentMethod = "Cash";
    else if (p.card) {
      paymentMethod = p.card.brand || "Card";
      last4 = p.card.last4;
    }
  }

  /* ================= CUSTOMER ================= */
  const customerName = receipt.customer
    ? `${receipt.customer.firstName || ""} ${receipt.customer.lastName || ""}`.trim()
    : "Walk-in Customer";

  const customerPhone = receipt.customer?.phone || "";
  const customerEmail = receipt.customer?.email || "";

  /* ================= VEHICLE ================= */
  const vehicleText = receipt.vehicle
    ? `${receipt.vehicle.year || ""} ${receipt.vehicle.make || ""} ${receipt.vehicle.model || ""}`.trim()
    : "—";

  const print = () => window.print();

  return (
    <div className="receipt-overlay">
      <div className="receipt-modal">

        {/* CONTROLS */}
        <div className="non-printable">
          <button className="btn print-btn" onClick={print}>🖨 Print</button>
          <button className="btn">📱 Text</button>
          <button className="btn">✉️ Email</button>
          <button className="btn close-btn" onClick={() => window.history.back()}>
            Close
          </button>
        </div>

        {/* PRINT AREA */}
        <div id="receipt-print-area" className="receipt-page">

          {/* HEADER */}
          <div className="header-block">
            {logo && <img src={logo} className="logo-img" alt="Logo" />}
          </div>

          {/* CUSTOMER / VEHICLE */}
          <div className="from-to-section">
            <div>
              <div className="section-title">Bill To</div>
              <div className="value">{customerName}</div>
              {customerPhone && <div className="value">{customerPhone}</div>}
              {customerEmail && <div className="value">{customerEmail}</div>}
            </div>

            <div>
              <div className="section-title">Vehicle</div>
              <div className="value">{vehicleText}</div>
            </div>
          </div>

          {/* ITEMS */}
          <div className="items-title">Items</div>
          <table className="items-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Qty</th>
                <th align="right">Price</th>
                <th align="right">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center text-gray-400">
                    No items
                  </td>
                </tr>
              ) : (
                items.map((i) => (
                  <tr key={i.cartId || i.productId || i.id}>
                    <td>
                      {i.name}
                      {i.sku && <div className="desc-sub">SKU: {i.sku}</div>}
                    </td>
                    <td>{i.qty || 1}</td>
                    <td align="right">${Number(i.price || 0).toFixed(2)}</td>
                    <td align="right">
                      ${((i.price || 0) * (i.qty || 1)).toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* TOTALS */}
          <div className="bottom-section">
            <div className="totals-block">
              <div className="totals-row">
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>

              {discountAmount > 0 && (
                <div className="totals-row">
                  <span>{discountLabel}</span>
                  <span>- ${discountAmount.toFixed(2)}</span>
                </div>
              )}

              <div className="totals-row">
                <span>Tax</span>
                <span>${tax.toFixed(2)}</span>
              </div>

              <div className="totals-row grand-total">
                <span>Total</span>
                <span>${finalTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="footer-text">
            Thank you for your business!
          </div>
        </div>
      </div>
    </div>
  );
}
