import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./ProductCheckIn.css";

import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  orderBy,
  limit,
  serverTimestamp,
  runTransaction,
  setDoc,
} from "firebase/firestore";

import { db } from "../firebase";

/* ===============================
   UNIT ITEM ID HELPERS
   Format: 2-letter brand code + number
   Examples:
   - "JL Audio" -> JL0001
   - "Rockford Fosgate" -> RF0001
   - "Hertz" -> HZ0001  (single word => first + last)
   =============================== */

function makeBrandCode(brand) {
  const raw = String(brand || "").trim();
  if (!raw) return "XX";

  // keep only letters/numbers/spaces for splitting, but also keep original for single-word fallback
  const words = raw
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  // Multi-word brand: first letters of first 2 words => RF, JL, etc.
  if (words.length >= 2) {
    const a = words[0][0] || "X";
    const b = words[1][0] || "X";
    return `${a}${b}`;
  }

  // Single-word brand: first + last letter => HZ for Hertz
  const cleaned = words[0] || raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!cleaned) return "XX";
  const first = cleaned[0] || "X";
  const last = cleaned[cleaned.length - 1] || first;
  return `${first}${last}`;
}

async function getNextUnitItemId(dbRef, brand) {
  const code = makeBrandCode(brand);
  const counterRef = doc(dbRef, "counters", `unit_${code}`);

  const nextNum = await runTransaction(dbRef, async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists() ? Number(snap.data()?.next || 1) : 1;
    tx.set(counterRef, { next: current + 1 }, { merge: true });
    return current;
  });

  // adaptive padding: minimum 4 digits, grows if needed
  const nStr = String(nextNum);
  const padLen = Math.max(4, nStr.length);
  return `${code}${nStr.padStart(padLen, "0")}`;
}

export default function ProductCheckIn() {
  const navigate = useNavigate();

  /* ===============================
     MASTER PRODUCT SELECTION
     =============================== */
  const [barcode, setBarcode] = useState("");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [product, setProduct] = useState(null);

  /* ===============================
     UNIT ENTRY
     =============================== */
  const [units, setUnits] = useState([{ cost: "", serial: "" }]);
  const [loading, setLoading] = useState(false);

  // last typed cost during THIS check-in session
  const [lastEnteredCost, setLastEnteredCost] = useState("");

  // spot/bin location for this check-in batch
  const [spot, setSpot] = useState("");

  // placeholder employee fields until Auth per employee is wired
  const [receivedByName] = useState("Front Counter");
  const [receivedById] = useState(null);

  /* ===============================
     BARCODE LOOKUP
     =============================== */
  const handleBarcodeScan = async (e) => {
    if (e.key !== "Enter") return;

    setLoading(true);
    setProduct(null);

    const q = query(
      collection(db, "products"),
      where("barcode", "==", barcode),
      limit(1)
    );

    const snap = await getDocs(q);

    if (snap.empty) {
      alert("No product found for this barcode.");
      setLoading(false);
      return;
    }

    const docSnap = snap.docs[0];
    setProduct({ id: docSnap.id, ...docSnap.data() });
    setSearchResults([]);
    setLoading(false);
  };

  /* ===============================
     SEARCH MASTER PRODUCTS
     =============================== */
  useEffect(() => {
    if (!search || search.trim().length < 2 || product) {
      setSearchResults([]);
      return;
    }

    const fetchProducts = async () => {
      const q = query(collection(db, "products"));
      const snap = await getDocs(q);

      const results = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p) =>
          `${p.name || ""} ${p.brand || ""} ${p.sku || ""} ${p.barcode || ""} ${p.id || ""}`
            .toLowerCase()
            .includes(search.toLowerCase())
        );

      setSearchResults(results.slice(0, 15));
    };

    fetchProducts();
  }, [search, product]);

  /* ===============================
     UNIT INPUT HANDLING
     =============================== */
  const updateUnit = (index, key, value) => {
    setUnits((prev) =>
      prev.map((u, i) => (i === index ? { ...u, [key]: value } : u))
    );

    if (key === "cost") {
      const cleaned = String(value ?? "").trim();
      if (cleaned !== "") setLastEnteredCost(cleaned);
    }
  };

  const addUnitRow = () => setUnits((prev) => [...prev, { cost: "", serial: "" }]);
  const removeUnitRow = (index) => setUnits((prev) => prev.filter((_, i) => i !== index));

  /* ===============================
     PREV COST BUTTON
     =============================== */
  const applyPrevCost = (index) => {
    if (lastEnteredCost !== "") {
      updateUnit(index, "cost", lastEnteredCost);
      return;
    }

    const fallback = product?.avgCost ?? product?.cost;
    if (fallback === undefined || fallback === null || fallback === "") return;

    updateUnit(index, "cost", String(fallback));
  };

  const prevCostDisabled =
    !lastEnteredCost &&
    (product?.avgCost === undefined ||
      product?.avgCost === null ||
      product?.avgCost === "") &&
    (product?.cost === undefined || product?.cost === null || product?.cost === "");

  /* ===============================
     UPDATE PRODUCT MASTER AVG COST
     =============================== */
  const updateProductAverageCost = async (productId, newCosts) => {
    const sumNew = newCosts.reduce((a, b) => a + b, 0);
    const qtyNew = newCosts.length;

    const prevAvg = Number(product?.avgCost ?? product?.cost ?? 0);
    const prevQty = Number(product?.avgCostQty ?? 0);

    const nextQty = prevQty + qtyNew;
    const nextAvg = nextQty > 0 ? (prevAvg * prevQty + sumNew) / nextQty : prevAvg;

    const nextAvgFixed = Number(nextAvg.toFixed(4));

    await updateDoc(doc(db, "products", productId), {
      avgCost: nextAvgFixed,
      avgCostQty: nextQty,
      cost: nextAvgFixed,
      updatedAt: serverTimestamp(),
    });

    setProduct((p) =>
      p
        ? {
            ...p,
            avgCost: nextAvgFixed,
            avgCostQty: nextQty,
            cost: nextAvgFixed,
          }
        : p
    );
  };

  /* ===============================
     FIFO BACKORDER ASSIGN
     =============================== */
  const assignBackordersFIFO = async (productId, unitDocId) => {
    const q = query(
      collection(db, "backorders"),
      where("productId", "==", productId),
      where("status", "==", "open"),
      orderBy("createdAt", "asc"),
      limit(1)
    );

    const snap = await getDocs(q);
    if (snap.empty) return;

    await updateDoc(snap.docs[0].ref, {
      status: "fulfilled",
      fulfilledAt: serverTimestamp(),
    });

    await updateDoc(doc(db, "productUnits", unitDocId), {
      status: "reserved",
      backorderId: snap.docs[0].id,
      reservedAt: serverTimestamp(),
    });
  };

  /* ===============================
     SAVE CHECK-IN
     =============================== */
  const handleSave = async () => {
    if (!product) return;

    if (units.some((u) => !u.cost)) {
      alert("Each unit must have a cost.");
      return;
    }

    setLoading(true);

    try {
      const costNumbers = units.map((u) => Number(u.cost));

      for (const u of units) {
        // ✅ NEW: generate unit-level Item ID (doc id)
        const unitId = await getNextUnitItemId(db, product.brand);

        await setDoc(doc(db, "productUnits", unitId), {
          unitId, // keep field for convenience
          productId: product.id,
          barcode: product.barcode || null,
          cost: Number(u.cost),
          serial: u.serial || null,
          status: "in_stock",
          spot: spot || null,
          receivedById: receivedById,
          receivedByName: receivedByName,
          receivedAt: serverTimestamp(),
        });

        await assignBackordersFIFO(product.id, unitId);
      }

      await updateProductAverageCost(product.id, costNumbers);

      alert("Product check-in complete ✅");
      setBarcode("");
      setSearch("");
      setProduct(null);
      setUnits([{ cost: "", serial: "" }]);
      setLastEnteredCost("");
      setSpot("");
    } catch (err) {
      console.error(err);
      alert("Check-in failed");
    } finally {
      setLoading(false);
    }
  };

  /* ===============================
     RESET PRODUCT
     =============================== */
  const resetProduct = () => {
    setProduct(null);
    setBarcode("");
    setSearch("");
    setSearchResults([]);
    setUnits([{ cost: "", serial: "" }]);
    setLastEnteredCost("");
    setSpot("");
  };

  /* ===============================
     UI
     =============================== */
  return (
    <div className="checkin-container">
      {/* Back button + title */}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button
          type="button"
          className="link-btn"
          onClick={() => navigate(-1)}
          disabled={loading}
          style={{ padding: "8px 12px" }}
        >
          ← Back
        </button>
        <h1 style={{ margin: 0 }}>📥 Product Check-In</h1>
      </div>

      {/* MASTER PRODUCT SEARCH */}
      {!product && (
        <input
          className="master-search"
          placeholder="Scan barcode or search by name / SKU / brand"
          value={search || barcode}
          onChange={(e) => {
            setSearch(e.target.value);
            setBarcode(e.target.value);
          }}
          onKeyDown={handleBarcodeScan}
          disabled={loading}
          autoFocus
        />
      )}

      {/* SEARCH RESULTS */}
      {!product && searchResults.length > 0 && (
        <div className="search-results">
          {searchResults.map((p) => (
            <div
              key={p.id}
              className="search-result"
              onClick={() => {
                setProduct(p);
                setSearchResults([]);
              }}
            >
              <strong>{p.name}</strong>
              <div className="meta">
                {p.brand} · {p.sku}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PRODUCT SUMMARY */}
      {product && (
        <div className="product-summary">
          <strong>{product.name}</strong>
          <div>Brand: {product.brand}</div>
          <div>SKU: {product.sku || "—"}</div>
          <div>Sell Price: ${Number(product.price || 0).toFixed(2)}</div>

          <div className="prev-cost-line">
            Avg Cost:{" "}
            {product.avgCost !== undefined && product.avgCost !== null && product.avgCost !== "" ? (
              `$${Number(product.avgCost).toFixed(2)}`
            ) : product.cost !== undefined && product.cost !== null && product.cost !== "" ? (
              `$${Number(product.cost).toFixed(2)}`
            ) : (
              "—"
            )}
          </div>

          <button className="link-btn" onClick={resetProduct}>
            Change product
          </button>
        </div>
      )}

      {/* Spot/Bin */}
      {product && (
        <div style={{ marginTop: 10 }}>
          <input
            className="master-search"
            placeholder="Spot / Bin (optional) — applies to all units"
            value={spot}
            onChange={(e) => setSpot(e.target.value)}
            disabled={loading}
          />
        </div>
      )}

      {/* UNIT ENTRY */}
      {product && (
        <div className="unit-list">
          <h3>Units Received</h3>

          {units.map((u, i) => (
            <div className="unit-row" key={i}>
              <div className="cost-wrap">
                <input
                  type="number"
                  step="0.01"
                  placeholder="Cost"
                  value={u.cost}
                  onChange={(e) => updateUnit(i, "cost", e.target.value)}
                />

                <button
                  type="button"
                  className="prev-cost-btn"
                  onClick={() => applyPrevCost(i)}
                  disabled={prevCostDisabled}
                  title={
                    lastEnteredCost
                      ? `Use last entered cost ($${Number(lastEnteredCost).toFixed(2)})`
                      : `Use average cost (${product?.avgCost ?? product?.cost ?? "—"})`
                  }
                >
                  ↺
                </button>
              </div>

              <input
                placeholder="Serial (optional)"
                value={u.serial}
                onChange={(e) => updateUnit(i, "serial", e.target.value)}
              />

              {units.length > 1 && (
                <button className="remove-btn" onClick={() => removeUnitRow(i)}>
                  ✕
                </button>
              )}
            </div>
          ))}

          <button className="add-row-btn" onClick={addUnitRow}>
            + Add another unit
          </button>
        </div>
      )}

      {/* ACTION */}
      {product && (
        <button className="save-btn" onClick={handleSave} disabled={loading}>
          ✅ Complete Check-In
        </button>
      )}
    </div>
  );
}
