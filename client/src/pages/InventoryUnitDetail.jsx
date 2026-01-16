import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";

function fmtDate(ts) {
  if (!ts) return "—";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString();
}

export default function InventoryUnitDetail() {
  const { unitId } = useParams();
  const navigate = useNavigate();

  const [unit, setUnit] = useState(null);

  useEffect(() => {
    (async () => {
      const snap = await getDoc(doc(db, "productUnits", unitId));
      if (snap.exists()) setUnit({ id: snap.id, ...snap.data() });
    })();
  }, [unitId]);

  if (!unit) {
    return (
      <div className="inventory-container">
        <div className="empty-state">Loading unit…</div>
      </div>
    );
  }

  return (
    <div className="inventory-container">
      <div className="search-row" style={{ display: "flex", gap: 8 }}>
        <button className="search-box" onClick={() => navigate(-1)} style={{ width: 120 }}>
          ← Back
        </button>

        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>Unit Detail</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Item ID: {unit.unitId || unit.id} • Status: {unit.status || "—"}
          </div>
        </div>
      </div>

      <div className="table-wrapper">
        <table className="inventory-table">
          <thead>
            <tr>
              <th style={{ width: 240 }}>Field</th>
              <th>Value</th>
            </tr>
          </thead>

          <tbody>
            <tr>
              <td>Item ID</td>
              <td>{unit.unitId || unit.id}</td>
            </tr>
            <tr>
              <td>Master Product ID</td>
              <td>{unit.productId || "—"}</td>
            </tr>
            <tr>
              <td>Barcode</td>
              <td>{unit.barcode || "—"}</td>
            </tr>
            <tr>
              <td>Serial</td>
              <td>{unit.serial || "—"}</td>
            </tr>
            <tr>
              <td>Status</td>
              <td>{unit.status || "—"}</td>
            </tr>

            <tr>
              <td>Received At</td>
              <td>{fmtDate(unit.receivedAt)}</td>
            </tr>
            <tr>
              <td>Received By</td>
              <td>{unit.receivedByName || unit.receivedById || "—"}</td>
            </tr>
            <tr>
              <td>Spot</td>
              <td>{unit.spot || "—"}</td>
            </tr>
            <tr>
              <td>Cost</td>
              <td>{typeof unit.cost === "number" ? `$${unit.cost.toFixed(2)}` : "—"}</td>
            </tr>

            {/* sale audit fields (populate later from sell flow) */}
            <tr>
              <td>Sold At</td>
              <td>{fmtDate(unit.soldAt)}</td>
            </tr>
            <tr>
              <td>Sold By</td>
              <td>{unit.soldByName || unit.soldById || "—"}</td>
            </tr>
            <tr>
              <td>Sold To</td>
              <td>{unit.soldToName || unit.soldToCustomerId || "—"}</td>
            </tr>
            <tr>
              <td>Sold Price</td>
              <td>
                {typeof unit.soldPrice === "number" ? `$${unit.soldPrice.toFixed(2)}` : "—"}
              </td>
            </tr>
            <tr>
              <td>Order ID</td>
              <td>{unit.soldOrderId || "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
