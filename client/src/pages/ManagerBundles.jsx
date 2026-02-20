// client/src/pages/ManagerBundles.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useSession } from "../session/SessionProvider";

function money(n) {
  const x = Number(n || 0);
  return x.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default function ManagerBundles() {
  const navigate = useNavigate();
  const { terminal, booting } = useSession();

  const tenantId = terminal?.tenantId || null;
  const shopId = terminal?.shopId || null;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const bundlesRef = useMemo(() => {
    if (!shopId) return null;
    return collection(db, "shops", shopId, "bundles");
  }, [shopId]);

  useEffect(() => {
    if (booting) return;
    if (!tenantId || !shopId || !bundlesRef) return;

    setLoading(true);

    const q = query(
      bundlesRef,
      where("tenantId", "==", tenantId),
      orderBy("name", "asc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error("[ManagerBundles] load error:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [booting, tenantId, shopId, bundlesRef]);

  const onToggleActive = async (b) => {
    try {
      await updateDoc(doc(db, "shops", shopId, "bundles", b.id), {
        active: !b.active,
        updatedAt: new Date(),
      });
    } catch (e) {
      console.error("toggle active failed:", e);
      alert("Failed to update bundle.");
    }
  };

  const onDelete = async (b) => {
    const ok = confirm(`Delete bundle "${b.name}"? This cannot be undone.`);
    if (!ok) return;
    try {
      await deleteDoc(doc(db, "shops", shopId, "bundles", b.id));
    } catch (e) {
      console.error("delete failed:", e);
      alert("Failed to delete bundle.");
    }
  };

  return (
    <div className="inventory-container">
      <div className="search-row" style={{ display: "flex", gap: 8 }}>
        <button
          className="search-box"
          onClick={() => navigate("/manager")}
          style={{ width: 120 }}
        >
          ← Back
        </button>

        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Bundles</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Bundle pricing + vehicle fitment targeting
          </div>
          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
            Shop: {shopId || "—"} · Tenant: {tenantId || "—"}
          </div>
        </div>

        <button
          className="search-box"
          onClick={() => navigate("/manager/bundles/new")}
          style={{ width: 160 }}
        >
          + New Bundle
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 12, opacity: 0.7 }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 14 }}>
          No bundles yet.
        </div>
      ) : (
        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          {rows.map((b) => {
            const itemsCount = Array.isArray(b.items) ? b.items.length : 0;
            const vehicleCount = Array.isArray(b.vehicleKeys)
              ? b.vehicleKeys.length
              : 0;

            return (
              <div
                key={b.id}
                style={{
                  border: "1px solid rgba(0,0,0,0.08)",
                  borderRadius: 12,
                  padding: 12,
                  background: "white",
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 900,
                      fontSize: 15,
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <span style={{ opacity: b.active ? 1 : 0.6 }}>
                      {b.name || "(Unnamed Bundle)"}
                    </span>
                    {!b.active && (
                      <span style={{ fontSize: 12, opacity: 0.7 }}>
                        (Inactive)
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 3 }}>
                    Price: <b>{money(b.bundlePrice)}</b> · Items:{" "}
                    <b>{itemsCount}</b> · Vehicles: <b>{vehicleCount}</b>
                  </div>

                  {b.sku ? (
                    <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                      SKU: {b.sku}
                    </div>
                  ) : null}
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    className="search-box"
                    onClick={() => navigate(`/manager/bundles/${b.id}`)}
                    style={{ width: 110 }}
                  >
                    Edit
                  </button>

                  <button
                    className="search-box"
                    onClick={() => onToggleActive(b)}
                    style={{ width: 140 }}
                  >
                    {b.active ? "Disable" : "Enable"}
                  </button>

                  <button
                    className="search-box"
                    onClick={() => onDelete(b)}
                    style={{ width: 110, opacity: 0.85 }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}







