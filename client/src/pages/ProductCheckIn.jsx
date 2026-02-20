// client/src/pages/ProductCheckIn.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  doc,
  updateDoc,
} from "firebase/firestore";
import { useSession } from "../session/SessionProvider";

export default function ProductCheckIn() {
  const navigate = useNavigate();
  const { terminal, booting, isUnlocked, devMode } = useSession();
  const tenantId = terminal?.tenantId;

  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);

  // ✅ tracking mode: "serialized" | "non"
  const [trackMode, setTrackMode] = useState("non");

  // Serialized flow
  const [serialInput, setSerialInput] = useState("");
  const [serials, setSerials] = useState([]);

  // Non-serialized flow
  const [qty, setQty] = useState(1);

  // ✅ bring back cost
  const [unitCost, setUnitCost] = useState("");

  // Notes
  const [note, setNote] = useState("");

  const [saving, setSaving] = useState(false);

  /* ================= LOAD PRODUCTS =================
     ✅ tenant-scoped + active products only
  =================================================== */
  useEffect(() => {
    if (booting) return;
    if (!devMode && !isUnlocked) return;
    if (!tenantId) return;

    const qy = query(
      collection(db, "products"),
      where("tenantId", "==", tenantId),
      where("active", "==", true)
    );

    return onSnapshot(
      qy,
      (snap) => setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("[ProductCheckIn products] permission/index error:", err)
    );
  }, [booting, devMode, isUnlocked, tenantId]);

  const filtered = useMemo(() => {
    const s = (search || "").trim().toLowerCase();
    if (!s) return [];
    return products
      .filter((p) => `${p.name || ""} ${p.sku || ""}`.toLowerCase().includes(s))
      .slice(0, 30);
  }, [products, search]);

  const productSuggestsSerialized = useMemo(() => {
    const p = selectedProduct;
    if (!p) return false;
    return (
      !!p.trackSerials ||
      !!p.requiresSerial ||
      !!p.serialized ||
      !!p.trackSerial ||
      !!p.trackSerialNumber
    );
  }, [selectedProduct]);

  // ✅ default mode to product flags, but still user-selectable
  useEffect(() => {
    if (!selectedProduct) return;

    setTrackMode(productSuggestsSerialized ? "serialized" : "non");
    setSerialInput("");
    setSerials([]);
    setQty(1);

    // leave cost + note intact if you want; I reset them for cleanliness
    setUnitCost("");
    setNote("");
  }, [selectedProduct, productSuggestsSerialized]);

  const resetForm = () => {
    setSelectedProduct(null);
    setSearch("");
    setTrackMode("non");
    setSerialInput("");
    setSerials([]);
    setQty(1);
    setUnitCost("");
    setNote("");
  };

  const addSerial = () => {
    const s = String(serialInput || "").trim();
    if (!s) return;
    if (serials.includes(s)) {
      setSerialInput("");
      return;
    }
    setSerials((prev) => [...prev, s]);
    setSerialInput("");
  };

  const removeSerial = (s) => setSerials((prev) => prev.filter((x) => x !== s));

  const parsedCost = () => {
    if (unitCost === "" || unitCost === null || unitCost === undefined) return null;
    const n = Number(unitCost);
    return Number.isFinite(n) ? n : null;
  };

  const submitCheckIn = async () => {
    if (!tenantId) {
      alert("No tenant selected. Please set up the terminal.");
      return;
    }
    if (!selectedProduct?.id) return;

    const isSerialized = trackMode === "serialized";

    if (isSerialized && serials.length === 0) {
      alert("Scan/add at least 1 serial number.");
      return;
    }

    const qNum = Number(qty);
    if (!isSerialized && (!Number.isFinite(qNum) || qNum <= 0)) {
      alert("Enter a valid quantity.");
      return;
    }

    const cost = parsedCost();
    if (unitCost !== "" && cost === null) {
      alert("Cost must be a number (example: 59.99).");
      return;
    }

    setSaving(true);
    try {
      const batch = writeBatch(db);

      const baseUnit = {
        tenantId, // ✅ REQUIRED for rules

        productId: selectedProduct.id,
        productName: selectedProduct.name || "",
        sku: selectedProduct.sku || "",

        // ✅ match your other code + reports (your reports use "in_stock"/"reserved")
        status: "in_stock",

        receivedAt: serverTimestamp(),
        notes: note || "",

        // ✅ cost stored per unit
        cost: cost, // null allowed

        createdAt: serverTimestamp(),
      };

      if (isSerialized) {
        for (const s of serials) {
          const ref = doc(collection(db, "productUnits"));
          batch.set(ref, {
            ...baseUnit,
            serial: s,
            hasSerial: true,
          });
        }
      } else {
        const count = Math.floor(qNum);
        for (let i = 0; i < count; i++) {
          const ref = doc(collection(db, "productUnits"));
          batch.set(ref, {
            ...baseUnit,
            serial: "",
            hasSerial: false,
          });
        }
      }

      await batch.commit();

      // OPTIONAL: store lastCost on product for convenience
      if (cost !== null) {
        try {
          await updateDoc(doc(db, "products", selectedProduct.id), {
            lastCost: cost,
            lastReceivedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (e) {
          // not fatal
          console.warn("could not update product lastCost:", e);
        }
      }

      alert("Checked in successfully.");
      resetForm();
    } catch (e) {
      console.error("check-in failed:", e);
      alert("Check-in failed. See console for details.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="inventory-container">
      {/* ✅ Back button restored */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => navigate(-1)}
          className="px-3 py-2 rounded-lg border bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 text-sm font-semibold"
        >
          ← Back
        </button>

        <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">
          Product Check-In
        </div>

        <div style={{ width: 88 }} />
      </div>

      {!selectedProduct ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border shadow-sm">
          <div className="text-sm font-semibold mb-2 text-slate-700 dark:text-slate-200">
            Select a product
          </div>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product name or SKU…"
            className="w-full h-11 px-3 rounded-lg border bg-white dark:bg-slate-950 dark:text-slate-100"
          />

          {search && (
            <div className="mt-2 border rounded-lg max-h-72 overflow-y-auto bg-white dark:bg-slate-950">
              {filtered.map((p) => (
                <div
                  key={p.id}
                  onMouseDown={() => {
                    setSelectedProduct(p);
                    setSearch("");
                  }}
                  className="px-3 py-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-900"
                >
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-xs text-slate-500">{p.sku || ""}</div>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="px-3 py-3 text-sm text-slate-500">No matches.</div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-bold text-slate-800 dark:text-slate-100">
                {selectedProduct.name}
              </div>
              <div className="text-xs text-slate-500">{selectedProduct.sku || ""}</div>
              <div className="mt-2 text-xs text-slate-500">
                Default: {productSuggestsSerialized ? "Serialized" : "Non-Serialized"}
              </div>
            </div>

            <button
              className="px-3 py-2 rounded-lg border hover:bg-slate-50 dark:hover:bg-slate-800 text-sm"
              onClick={resetForm}
              disabled={saving}
            >
              Change Product
            </button>
          </div>

          {/* ✅ Mode selector */}
          <div className="mt-4">
            <div className="text-sm font-semibold mb-2 text-slate-700 dark:text-slate-200">
              Tracking Mode
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setTrackMode("non")}
                disabled={saving}
                className={[
                  "px-3 py-2 rounded-lg border text-sm font-semibold",
                  trackMode === "non"
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white hover:bg-slate-50 dark:bg-slate-950 dark:hover:bg-slate-800",
                ].join(" ")}
              >
                Non-Serialized (Qty)
              </button>
              <button
                onClick={() => setTrackMode("serialized")}
                disabled={saving}
                className={[
                  "px-3 py-2 rounded-lg border text-sm font-semibold",
                  trackMode === "serialized"
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white hover:bg-slate-50 dark:bg-slate-950 dark:hover:bg-slate-800",
                ].join(" ")}
              >
                Serialized (Serials)
              </button>
            </div>
          </div>

          {/* ✅ Cost restored */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-sm font-semibold mb-1 text-slate-700 dark:text-slate-200">
                Unit Cost (optional)
              </div>
              <input
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder="Example: 59.99"
                className="w-full h-11 px-3 rounded-lg border bg-white dark:bg-slate-950 dark:text-slate-100"
                disabled={saving}
              />
              <div className="text-xs text-slate-500 mt-1">
                Applied to every unit created in this check-in.
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold mb-1 text-slate-700 dark:text-slate-200">
                Notes (optional)
              </div>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Vendor, PO #, etc…"
                className="w-full h-11 px-3 rounded-lg border bg-white dark:bg-slate-950 dark:text-slate-100"
                disabled={saving}
              />
            </div>
          </div>

          {/* SERIALIZED */}
          {trackMode === "serialized" ? (
            <div className="mt-4">
              <div className="text-sm font-semibold mb-1 text-slate-700 dark:text-slate-200">
                Scan / Enter Serial Numbers
              </div>

              <div className="flex gap-2">
                <input
                  value={serialInput}
                  onChange={(e) => setSerialInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addSerial();
                    }
                  }}
                  placeholder="Scan serial and press Enter…"
                  className="flex-1 h-11 px-3 rounded-lg border bg-white dark:bg-slate-950 dark:text-slate-100"
                  disabled={saving}
                />
                <button
                  onClick={addSerial}
                  disabled={saving}
                  className="px-4 h-11 rounded-lg bg-brand-primary hover:bg-brand-primary/90 text-white font-semibold disabled:opacity-60"
                >
                  Add
                </button>
              </div>

              <div className="mt-3 border rounded-lg overflow-hidden">
                <div className="bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs font-bold">
                  Serial List ({serials.length})
                </div>
                {serials.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-slate-500">
                    No serials added yet.
                  </div>
                ) : (
                  <div className="max-h-52 overflow-y-auto">
                    {serials.map((s) => (
                      <div
                        key={s}
                        className="px-3 py-2 border-t flex items-center justify-between"
                      >
                        <div className="text-sm">{s}</div>
                        <button
                          className="text-sm text-red-600 hover:underline"
                          onClick={() => removeSerial(s)}
                          disabled={saving}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* NON-SERIALIZED */
            <div className="mt-4">
              <div className="text-sm font-semibold mb-1 text-slate-700 dark:text-slate-200">
                Quantity Received
              </div>
              <input
                type="number"
                min="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-44 h-11 px-3 rounded-lg border bg-white dark:bg-slate-950 dark:text-slate-100"
                disabled={saving}
              />
              <div className="text-xs text-slate-500 mt-2">
                This will create <b>{Math.floor(Number(qty) || 0)}</b> unit record(s)
                in <code>productUnits</code>.
              </div>
            </div>
          )}

          {/* SUBMIT */}
          <div className="mt-5 flex justify-end gap-2">
            <button
              className="px-4 py-2 rounded-lg border hover:bg-slate-50 dark:hover:bg-slate-800"
              onClick={resetForm}
              disabled={saving}
            >
              Cancel
            </button>

            <button
              onClick={submitCheckIn}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-brand-accent hover:bg-brand-accent/90 text-white font-semibold disabled:opacity-60"
            >
              {saving ? "Saving..." : "Check In"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
