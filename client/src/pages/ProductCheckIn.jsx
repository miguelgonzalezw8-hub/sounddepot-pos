import { useState, useEffect } from "react";
import "./ProductCheckIn.css";

import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  orderBy,
  limit,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "../firebase";

export default function ProductCheckIn() {
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
        `${p.name || ""} ${p.brand || ""} ${p.sku || ""} ${p.barcode || ""}`
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
  };

  const addUnitRow = () => {
    setUnits((prev) => [...prev, { cost: "", serial: "" }]);
  };

  const removeUnitRow = (index) => {
    setUnits((prev) => prev.filter((_, i) => i !== index));
  };

  /* ===============================
     FIFO BACKORDER ASSIGN
     =============================== */
  const assignBackordersFIFO = async (productId, unitRefId) => {
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

    await updateDoc(
      collection(db, "productUnits").doc(unitRefId),
      { status: "reserved", backorderId: snap.docs[0].id }
    );
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

    for (const u of units) {
      const unitRef = await addDoc(collection(db, "productUnits"), {
        productId: product.id,
        barcode: product.barcode || null,
        cost: Number(u.cost),
        serial: u.serial || null,
        status: "in_stock",
        receivedAt: serverTimestamp(),
      });

      await assignBackordersFIFO(product.id, unitRef.id);
    }

    alert("Product check-in complete ✅");
    setBarcode("");
    setSearch("");
    setProduct(null);
    setUnits([{ cost: "", serial: "" }]);
    setLoading(false);
  };

  /* ===============================
     RESET PRODUCT
     =============================== */
  const resetProduct = () => {
    setProduct(null);
    setBarcode("");
    setSearch("");
    setSearchResults([]);
  };

  /* ===============================
     UI
     =============================== */
  return (
    <div className="checkin-container">
      <h1>📥 Product Check-In</h1>

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
          <button className="link-btn" onClick={resetProduct}>
            Change product
          </button>
        </div>
      )}

      {/* UNIT ENTRY */}
      {product && (
        <div className="unit-list">
          <h3>Units Received</h3>

          {units.map((u, i) => (
            <div className="unit-row" key={i}>
              <input
                type="number"
                placeholder="Cost"
                value={u.cost}
                onChange={(e) => updateUnit(i, "cost", e.target.value)}
              />
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
