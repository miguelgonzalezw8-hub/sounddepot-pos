import { useEffect, useState } from "react";
import { db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import "./ReceiptPrint.css";

export default function ReceiptPrint() {
  const [receipt, setReceipt] = useState(null);
  const [template, setTemplate] = useState(null);

  /* ================= LOAD DATA ================= */
  useEffect(() => {
    const r = localStorage.getItem("currentReceipt");
    if (r) setReceipt(JSON.parse(r));

    const loadTemplate = async () => {
      const snap = await getDoc(doc(db, "settings", "receiptTemplate"));
      if (snap.exists()) setTemplate(snap.data());
    };

    loadTemplate();
  }, []);

  if (!receipt || !template) {
    return <div className="p-6">Loading receipt…</div>;
  }

  /* ================= ITEMS ================= */
  const items = receipt.items || receipt.cartItems || [];

  /* ================= TOTALS ================= */
  const subtotal =
    receipt.subtotal ??
    items.reduce((s, i) => s + (i.price || 0) * (i.qty || 1), 0);

  const tax = receipt.tax ?? 0;

  let discountAmount = receipt.discount ?? 0;
  let discountLabel = "Discount";

  if (receipt.discountPercent) {
    discountAmount = subtotal * (receipt.discountPercent / 100);
    discountLabel = `${receipt.discountPercent}% Discount`;
  }

  const total = subtotal - discountAmount + tax;

  /* ================= PAYMENT ================= */
  const payment = receipt.payment || {};
  const paymentMethod =
    payment.method || payment.type || "—";

  /* ================= CUSTOMER ================= */
  const customer = receipt.customer;
  const customerName = customer
    ? customer.companyName ||
      `${customer.firstName || ""} ${customer.lastName || ""}`.trim()
    : "Walk-in Customer";

  /* ================= VEHICLE ================= */
  const vehicle = receipt.vehicle;
  const vehicleText = vehicle
    ? `${vehicle.year || ""} ${vehicle.make || ""} ${vehicle.model || ""}`.trim()
    : "—";

  /* ================= INSTALLER ================= */
  const installerName = receipt.installer?.name || "—";

  const print = () => window.print();

  return (
    <div className="receipt-overlay">
      <div className="receipt-modal">

        {/* CONTROLS */}
        <div className="non-printable">
          <button className="btn print-btn" onClick={print}>🖨 Print</button>
          <button className="btn close-btn" onClick={() => window.history.back()}>
            Close
          </button>
        </div>

        {/* PRINT AREA */}
        <div id="receipt-print-area" className="receipt-page">

          {/* HEADER */}
          <div className="header-block">
            {template.showLogo && template.logoUrl && (
              <img src={template.logoUrl} className="logo-img" alt="Logo" />
            )}

            <div className="shop-info">
              <div className="shop-name">{template.shopName}</div>
              <div>{template.address}</div>
              <div>{template.phone}</div>
            </div>

            {template.headerMessage && (
              <div className="header-message">
                {template.headerMessage}
              </div>
            )}
          </div>

          {/* CUSTOMER / VEHICLE */}
          <div className="from-to-section">
            <div>
              <div className="section-title">Customer</div>
              <div className="value">{customerName}</div>
            </div>

            <div>
              <div className="section-title">Vehicle</div>
              <div className="value">{vehicleText}</div>
            </div>
          </div>

          {/* INSTALLER */}
          <div className="single-line">
            <strong>Installer:</strong> {installerName}
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
              {items.map((i) => (
                <tr key={i.cartId || i.id}>
                  <td>{i.name}</td>
                  <td>{i.qty || 1}</td>
                  <td align="right">${Number(i.price || 0).toFixed(2)}</td>
                  <td align="right">
                    ${((i.price || 0) * (i.qty || 1)).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* TOTALS */}
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
              <span>${total.toFixed(2)}</span>
            </div>

            <div className="payment-line">
              Payment Method: {paymentMethod}
            </div>
          </div>

          {/* POLICIES */}
          {template.productWarranty && (
            <div className="policy-block">
              <strong>Product Warranty</strong>
              <div>{template.productWarranty}</div>
            </div>
          )}

          {template.laborWarranty && (
            <div className="policy-block">
              <strong>Labor Warranty</strong>
              <div>{template.laborWarranty}</div>
            </div>
          )}

          {template.returnPolicy && (
            <div className="policy-block">
              <strong>Return Policy</strong>
              <div>{template.returnPolicy}</div>
            </div>
          )}

          {/* FOOTER */}
          {template.footerText && (
            <div className="footer-text">
              {template.footerText}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}







