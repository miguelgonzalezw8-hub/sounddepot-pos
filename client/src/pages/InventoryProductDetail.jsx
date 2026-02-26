// client/src/pages/InventoryProductDetail.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../firebase";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  where,
  deleteDoc,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { useSession } from "../session/SessionProvider";

function fmtDate(ts) {
  if (!ts) return "—";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString();
}

// SHA-256 helper (browser Web Crypto)
async function sha256Hex(input) {
  const enc = new TextEncoder();
  const data = enc.encode(String(input));
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ===============================
   Simple in-app modal (no Edge prompts)
   =============================== */
function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 9999,
      }}
      onMouseDown={onClose}
    >
      <div
        style={{
          width: "min(520px, 100%)",
          background: "white",
          borderRadius: 14,
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          border: "1px solid rgba(0,0,0,0.08)",
          overflow: "hidden",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ padding: 14, borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>{title}</div>
        </div>
        <div style={{ padding: 14 }}>{children}</div>
      </div>
    </div>
  );
}

export default function InventoryProductDetail() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const auth = getAuth();

  // ✅ Session
  const { terminal, tenant, devMode, canManagerOverride } = useSession();
  const tenantId = terminal?.tenantId || tenant?.tenantId;

  // ✅ Owner terminal bypass (no PIN required)
  const isOwnerTerminal = terminal?.mode === "owner";

  // ✅ This is the "bypass pin" switch for this page
  // dev OR owner terminal OR owner/manager role (via SessionProvider)
  const bypassPin = !!devMode || !!isOwnerTerminal || !!canManagerOverride;

  const [product, setProduct] = useState(null);
  const [units, setUnits] = useState([]);

  // ✅ default to ALL so units never "disappear" after refresh
  const [statusFilter, setStatusFilter] = useState("ALL"); // in_stock | sold | reserved | ALL
  const [search, setSearch] = useState("");

  // UI feedback (in-app)
  const [pageError, setPageError] = useState("");
  const [toast, setToast] = useState("");

  // Delete modal state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteUnit, setDeleteUnit] = useState(null);
  const [pin, setPin] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteErr, setDeleteErr] = useState("");

  // Load master product (✅ tenant-checked)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setPageError("");
      setProduct(null);

      if (!tenantId) {
        setPageError("No tenant loaded. Log in / load a terminal session first.");
        return;
      }

      try {
        const snap = await getDoc(doc(db, "products", productId));
        if (!snap.exists()) {
          if (!cancelled) setPageError("Product not found.");
          return;
        }

        const data = snap.data() || {};
        // ✅ if you somehow open a product from another tenant, show a clear error instead of permission loops
        if (data.tenantId && data.tenantId !== tenantId) {
          if (!cancelled) {
            setPageError("Permission denied: this product belongs to a different tenant.");
            setProduct(null);
          }
          return;
        }

        if (!cancelled) setProduct({ id: snap.id, ...data });
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setPageError(
            err?.message?.includes("permission")
              ? "Permission denied while loading product. Check tenant scoping / rules."
              : "Failed to load product."
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [productId, tenantId]);

  // Load units (from productUnits) ✅ TENANT-SCOPED QUERY
  useEffect(() => {
    setPageError("");

    if (!tenantId) {
      setUnits([]);
      setPageError("No tenant loaded. Log in / load a terminal session first.");
      return;
    }

    const base = collection(db, "productUnits");

    // ✅ CRITICAL: tenantId must be in the query for rules to allow it
    const qUnits =
      statusFilter === "ALL"
        ? query(
            base,
            where("tenantId", "==", tenantId),
            where("productId", "==", productId),
            orderBy("receivedAt", "desc")
          )
        : query(
            base,
            where("tenantId", "==", tenantId),
            where("productId", "==", productId),
            where("status", "==", statusFilter),
            orderBy("receivedAt", "desc")
          );

    const unsub = onSnapshot(
      qUnits,
      (snap) => {
        setUnits(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => {
        console.error(err);
        setUnits([]);
        setPageError(
          err?.message?.includes("index")
            ? "This query needs a Firestore index. Check the console error link and create the index."
            : err?.message?.includes("permission")
            ? "Permission denied. This query must be tenant-scoped and your rules must allow productUnits for your tenant."
            : "Failed to load checked-in units."
        );
      }
    );

    return () => unsub();
  }, [productId, statusFilter, tenantId]);

  // little toast auto-clear
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const filteredUnits = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return units;
    return units.filter((u) =>
      `${u.unitId || u.id || ""} ${u.serialNumber || u.serial || ""} ${u.barcode || ""} ${
        u.spot || ""
      } ${u.receivedByName || ""}`
        .toLowerCase()
        .includes(s)
    );
  }, [units, search]);

  const openDeleteModal = (unit) => {
    // Don’t allow deleting sold units (audit integrity)
    if (unit.status === "sold") {
      setToast("Sold units cannot be deleted.");
      return;
    }

    setDeleteErr("");
    setPin("");
    setDeleteUnit(unit);
    setDeleteOpen(true);
  };

  const doDeleteNow = async () => {
    if (!deleteUnit) return;

    setDeleteBusy(true);
    setDeleteErr("");

    try {
      await deleteDoc(doc(db, "productUnits", deleteUnit.id));

      // verify it’s truly gone (helps catch permission/failed writes)
      const verify = await getDoc(doc(db, "productUnits", deleteUnit.id));
      if (verify.exists()) {
        setDeleteErr("Delete failed (unit still exists). Check permissions/rules.");
        return;
      }

      setDeleteOpen(false);
      setDeleteUnit(null);
      setPin("");
      setToast("Unit deleted ✅");
    } catch (err) {
      console.error(err);
      setDeleteErr(
        err?.message?.includes("permission")
          ? "Permission denied while deleting unit."
          : "Delete failed."
      );
    } finally {
      setDeleteBusy(false);
    }
  };

  const confirmDeleteWithPin = async () => {
    if (!deleteUnit) return;

    // ✅ BYPASS: dev OR owner terminal OR owner/manager role
    if (bypassPin) {
      await doDeleteNow();
      return;
    }

    const uid = auth.currentUser?.uid || null;
    if (!uid) {
      setDeleteErr("Not signed in.");
      return;
    }

    if (!pin) {
      setDeleteErr("Enter manager PIN.");
      return;
    }

    setDeleteBusy(true);
    setDeleteErr("");

    try {
      // Read manager pin hash (manager-only doc)
      const secSnap = await getDoc(doc(db, "settings", "security"));
      const pins = secSnap.exists() ? secSnap.data()?.managerPins || {} : {};
      const storedHash = pins[uid];

      if (!storedHash) {
        setDeleteErr("No manager PIN set for this account. Set it in Manager → PIN.");
        return;
      }

      const enteredHash = await sha256Hex(pin);
      if (enteredHash !== storedHash) {
        setDeleteErr("Invalid PIN.");
        return;
      }

      await doDeleteNow();
    } catch (err) {
      console.error(err);
      setDeleteErr(
        err?.message?.includes("permission")
          ? "Permission denied. Only managers can delete units."
          : "Delete failed."
      );
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="inventory-container">
      {/* in-app toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            top: 16,
            right: 16,
            background: "rgba(15, 23, 42, 0.95)",
            color: "white",
            padding: "10px 12px",
            borderRadius: 12,
            zIndex: 9999,
            fontSize: 13,
          }}
        >
          {toast}
        </div>
      )}

      <div className="search-row" style={{ display: "flex", gap: 8 }}>
        <button className="search-box" onClick={() => navigate(-1)} style={{ width: 120 }}>
          ← Back
        </button>

        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{product?.name || "Product"}</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>SKU: {product?.sku || productId}</div>
        </div>

        <select
          className="search-box"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ width: 180 }}
        >
          <option value="ALL">All</option>
          <option value="in_stock">In Stock</option>
          <option value="reserved">Reserved</option>
          <option value="sold">Sold</option>
        </select>
      </div>

      {pageError && (
        <div
          style={{
            marginTop: 8,
            padding: 10,
            borderRadius: 12,
            border: "1px solid rgba(239,68,68,0.35)",
            background: "rgba(239,68,68,0.08)",
            color: "#991b1b",
            fontSize: 13,
          }}
        >
          {pageError}
        </div>
      )}

      <div className="search-row">
        <input
          className="search-box search-box-wide"
          placeholder="Search item ID, serial, barcode, spot, received by..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </div>

      <div className="table-wrapper">
        <table className="inventory-table">
          <thead>
            <tr>
              <th>Item ID</th>
              <th>Serial</th>
              <th>Barcode</th>
              <th>Status</th>
              <th>Spot</th>
              <th>Received</th>
              <th>Cost</th>
              <th style={{ width: 110 }}></th>
            </tr>
          </thead>

          <tbody>
            {filteredUnits.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty-state">
                  No checked-in units found for this product.
                </td>
              </tr>
            ) : (
              filteredUnits.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => navigate(`/inventory/unit/${u.id}`)}
                  style={{ cursor: "pointer" }}
                  title="Click to inspect unit"
                >
                  <td>{u.unitId || u.id}</td>
                  <td>{u.serialNumber || u.serial || "—"}</td>
                  <td>{u.barcode || "—"}</td>
                  <td>{u.status || "—"}</td>
                  <td>{u.spot || "—"}</td>
                  <td>{fmtDate(u.receivedAt)}</td>
                  <td>{typeof u.cost === "number" ? `$${u.cost.toFixed(2)}` : "—"}</td>

                  <td onClick={(e) => e.stopPropagation()}>
                    <button
                      className="delete-btn"
                      disabled={u.status === "sold"}
                      title={
                        u.status === "sold"
                          ? "Sold units cannot be deleted"
                          : bypassPin
                          ? "Delete this unit"
                          : "Delete this unit (requires manager PIN)"
                      }
                      onClick={() => openDeleteModal(u)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* In-app delete + PIN modal */}
      <Modal
        open={deleteOpen}
        title={`Delete ${deleteUnit?.unitId || deleteUnit?.id || ""}`}
        onClose={() => {
          if (deleteBusy) return;
          setDeleteOpen(false);
          setDeleteUnit(null);
          setDeleteErr("");
          setPin("");
        }}
      >
        <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 10 }}>
          This should only be used to correct check-in mistakes.
        </div>

        {!bypassPin ? (
          <>
            <div style={{ marginBottom: 8, fontWeight: 700, fontSize: 13 }}>Manager PIN</div>
            <input
              className="search-box search-box-wide"
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Enter PIN"
              disabled={deleteBusy}
            />
          </>
        ) : (
          <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 10 }}>
            Owner/Manager verified — no PIN required.
          </div>
        )}

        {deleteErr && (
          <div style={{ marginTop: 10, color: "#b91c1c", fontSize: 13 }}>{deleteErr}</div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button
            className="search-box"
            onClick={() => {
              if (deleteBusy) return;
              setDeleteOpen(false);
              setDeleteUnit(null);
              setDeleteErr("");
              setPin("");
            }}
            style={{ width: 120 }}
            disabled={deleteBusy}
          >
            Cancel
          </button>

          <button
            className="save-btn"
            onClick={confirmDeleteWithPin}
            disabled={deleteBusy}
            style={{ flex: 1 }}
          >
            {deleteBusy ? "Deleting..." : "Confirm Delete"}
          </button>
        </div>
      </Modal>
    </div>
  );
}