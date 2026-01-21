// client/src/pages/HeldReceipts.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  onSnapshot,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "../firebase";

function formatMoney(n) {
  const x = Number(n || 0);
  return x.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function tsToMillis(v) {
  if (!v) return 0;
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.toDate === "function") return v.toDate().getTime();
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  }
  return 0;
}

function safeDateLabel(v) {
  const ms = tsToMillis(v);
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return "";
  }
}

function guessCustomerLabel(r) {
  const c = r?.customer || null;
  if (!c) return "Walk-in";

  const name =
    c.companyName ||
    `${c.firstName || ""} ${c.lastName || ""}`.trim() ||
    "";

  return name || c.phone || "Walk-in";
}

function guessVehicleLabel(r) {
  const v = r?.vehicle || null;
  if (!v) return "";

  if (typeof v === "string") return v;

  const year = v.year || v.yr || "";
  const make = v.make || "";
  const model = v.model || "";
  const trim = v.trim || "";

  return [year, make, model, trim].filter(Boolean).join(" ");
}

function countItems(r) {
  const items = Array.isArray(r?.cartItems) ? r.cartItems : [];
  // sum qty, fallback 1
  return items.reduce((s, it) => s + Number(it?.qty ?? 1), 0);
}

export default function HeldReceipts() {
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [qText, setQText] = useState("");

  useEffect(() => {
    setLoading(true);

    // ✅ MATCHES YOUR SELL LOGIC:
    // Sell writes held receipts with NO tenant/shop filters,
    // so we must read the whole collection.
    const unsub = onSnapshot(
      collection(db, "heldReceipts"),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        // ✅ no index: sort locally by createdAt desc
        list.sort((a, b) => tsToMillis(b.createdAt) - tsToMillis(a.createdAt));

        setRows(list);
        setLoading(false);
      },
      (err) => {
        console.error("HeldReceipts snapshot error:", err);
        alert(err?.message || String(err));
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const t = qText.trim().toLowerCase();
    if (!t) return rows;

    return rows.filter((r) => {
      const customer = guessCustomerLabel(r).toLowerCase();
      const vehicle = guessVehicleLabel(r).toLowerCase();
      const id = String(r.id || "").toLowerCase();
      const status = String(r.status || "").toLowerCase();

      return (
        customer.includes(t) ||
        vehicle.includes(t) ||
        id.includes(t) ||
        status.includes(t)
      );
    });
  }, [rows, qText]);

  function resumeHeld(r) {
    if (!r?.id) return;

    // ✅ THIS MATCHES YOUR SELL.jsx restore logic EXACTLY
    // Sell checks sessionStorage.resumeReceipt and restores cart/customer/etc from it.
    const payload = {
      cartItems: r.cartItems || [],
      customer: r.customer ?? null,
      vehicle: r.vehicle ?? null,
      installer: r.installer ?? null,
      installAt: r.installAt ?? null,
      subtotal: Number(r.subtotal || 0),
      tax: Number(r.tax || 0),
      total: Number(r.total || 0),
    };

    sessionStorage.setItem("resumeReceipt", JSON.stringify(payload));

    // Optional: you can also store heldId if you want to delete after resume later
    sessionStorage.setItem("resumeHeldId", r.id);

    navigate("/sell");
  }

  async function removeHeld(r) {
    if (!r?.id) return;
    const ok = confirm(`Delete held receipt for "${guessCustomerLabel(r)}"?`);
    if (!ok) return;

    try {
      await deleteDoc(doc(db, "heldReceipts", r.id));
    } catch (e) {
      console.error(e);
      alert(e?.message || String(e));
    }
  }

  return (
    <div className="inventory-container">
      <div
        className="search-row"
        style={{ display: "flex", gap: 8, alignItems: "center" }}
      >
        <button
          className="search-box"
          style={{ width: 120 }}
          onClick={() => navigate(-1)}
        >
          ← Back
        </button>

        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Held Receipts</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Resume a cart that was put on hold
          </div>
        </div>

        <input
          className="search-box"
          placeholder="Search held receipts…"
          value={qText}
          onChange={(e) => setQText(e.target.value)}
          style={{ width: 320 }}
        />
      </div>

      <div className="table-wrapper" style={{ marginTop: 10 }}>
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">No held receipts.</div>
        ) : (
          <table className="inventory-table">
            <thead>
              <tr>
                <th style={{ width: 220 }}>Customer</th>
                <th>Vehicle</th>
                <th style={{ width: 110 }}>Items</th>
                <th style={{ width: 140 }}>Total</th>
                <th style={{ width: 220 }}>Created</th>
                <th style={{ width: 240 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const created = safeDateLabel(r.createdAt);
                return (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 800 }}>{guessCustomerLabel(r)}</td>
                    <td>{guessVehicleLabel(r)}</td>
                    <td>{countItems(r)}</td>
                    <td>{formatMoney(r.total)}</td>
                    <td style={{ fontSize: 12, opacity: 0.8 }}>{created}</td>
                    <td>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          className="search-box"
                          style={{ width: 110 }}
                          onClick={() => resumeHeld(r)}
                        >
                          Resume
                        </button>
                        <button
                          className="search-box"
                          style={{ width: 110 }}
                          onClick={() => removeHeld(r)}
                        >
                          Delete
                        </button>
                      </div>
                      <div style={{ marginTop: 6, fontSize: 11, opacity: 0.6 }}>
                        id: {r.id}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
