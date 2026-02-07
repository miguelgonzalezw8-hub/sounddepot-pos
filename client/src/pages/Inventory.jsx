// client/src/pages/Inventory.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./Inventory.css";

import AddProductModal from "../components/AddProductModal";
import AddBrandModal from "../components/AddBrandModal";

import { useSession } from "../session/SessionProvider";

// FIREBASE
import {
  collection,
  addDoc,
  setDoc,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
  deleteDoc,
  doc,
  runTransaction,
  where,
} from "firebase/firestore";

import { db } from "../firebase";

/* ===============================
   NEAT PRODUCT ID HELPERS
   Format: <BRANDCODE><####>
   BRANDCODE = first + last char of brand (A-Z0-9), uppercase
   Example: "JL Audio" -> "JO0001"
   =============================== */
function makeBrandCode(brand) {
  const cleaned = String(brand || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (cleaned.length >= 2) return cleaned[0] + cleaned[cleaned.length - 1];
  if (cleaned.length === 1) return cleaned[0] + cleaned[0];
  return "XX";
}

// NOTE: We pass tenantId so counters are per-tenant (prevents collisions across shops)
async function getNextProductIdForBrand(dbRef, tenantId, brand) {
  const brandCode = makeBrandCode(brand);

  // ✅ Per-tenant counter doc id
  const counterRef = doc(dbRef, "counters", `t_${tenantId}_products_${brandCode}`);

  const nextNum = await runTransaction(dbRef, async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists() ? Number(snap.data()?.next || 1) : 1;

    tx.set(
      counterRef,
      { tenantId, brandCode, next: current + 1, updatedAt: serverTimestamp() },
      { merge: true }
    );

    return current;
  });

  const padded = String(nextNum).padStart(4, "0");
  return `${brandCode}${padded}`;
}

export default function Inventory() {
  const navigate = useNavigate();

  const { terminal, booting, isUnlocked, devMode } = useSession();
  const tenantId = terminal?.tenantId;

  // ===============================
  // STATE
  // ===============================
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [brandModalOpen, setBrandModalOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [brands, setBrands] = useState([]); // ✅ tenant-scoped brands for modal
  const [editingItem, setEditingItem] = useState(null);

  // ===============================
  // SAVE PRODUCT (MASTER PRODUCT)
  // ===============================
  const handleSaveProduct = async (product) => {
    try {
      if (!tenantId) {
        alert("No tenant selected. Please set up the terminal.");
        return;
      }

      const payload = {
        ...product,
        tenantId, // ✅ REQUIRED for rules + multi-tenant
        price: Number(product.price) || 0,
        stock: Number(product.stock) || 0, // TEMP – derived later
        updatedAt: serverTimestamp(),
      };

      if (editingItem) {
        await updateDoc(doc(db, "products", editingItem.id), payload);
        alert("Product updated");
        setEditingItem(null);
      } else {
        // ✅ readable product ID instead of Firestore auto-id
        const neatId = await getNextProductIdForBrand(db, tenantId, payload.brand);

        await setDoc(doc(db, "products", neatId), {
          ...payload,
          createdAt: serverTimestamp(),
          active: true,
        });

        alert(`Product added (${neatId})`);
      }

      setModalOpen(false);
    } catch (err) {
      console.error("[Inventory handleSaveProduct] failed:", err);
      alert("Failed to save product");
    }
  };

  // ===============================
  // SAVE BRAND
  // ===============================
  const handleSaveBrand = async (brand) => {
    try {
      if (!tenantId) {
        alert("No tenant selected. Please set up the terminal.");
        return;
      }

      await addDoc(collection(db, "brands"), {
        ...brand,
        tenantId, // ✅ REQUIRED for rules + multi-tenant
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      alert("Brand added");
      setBrandModalOpen(false);
    } catch (err) {
      console.error("[Inventory handleSaveBrand] failed:", err);
      alert("Failed to save brand");
    }
  };

  // ===============================
  // DELETE PRODUCT (MASTER ONLY)
  // ===============================
  const handleDelete = async (id) => {
    if (!window.confirm("Delete this product master?")) return;
    try {
      await deleteDoc(doc(db, "products", id));
    } catch (err) {
      console.error("[Inventory handleDelete] failed:", err);
      alert("Delete failed");
    }
  };

  // ===============================
  // LOAD PRODUCTS (MASTER LIST)
  // ✅ tenant-scoped query for your rules
  // ===============================
  useEffect(() => {
    if (booting) return;
    if (!devMode && !isUnlocked) return;
    if (!tenantId) return;

    const qy = query(
      collection(db, "products"),
      where("tenantId", "==", tenantId),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      qy,
      (snapshot) => {
        setItems(
          snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }))
        );
      },
      (err) => {
        console.error("[SNAPSHOT DENIED] Inventory products", err);
      }
    );

    return () => unsubscribe();
  }, [booting, isUnlocked, devMode, tenantId]);

  // ===============================
  // LOAD BRANDS (tenant-scoped)
  // ✅ prevents modals from needing global reads
  // ===============================
  useEffect(() => {
    if (booting) return;
    if (!devMode && !isUnlocked) return;
    if (!tenantId) return;

    const qy = query(
      collection(db, "brands"),
      where("tenantId", "==", tenantId),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      qy,
      (snapshot) => {
        setBrands(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => {
        console.error("[SNAPSHOT DENIED] Inventory brands", err);
      }
    );

    return () => unsubscribe();
  }, [booting, isUnlocked, devMode, tenantId]);

  // ===============================
  // FILTER SEARCH
  // ===============================
  const filteredItems =
    search.trim().length === 0
      ? []
      : items.filter((i) =>
          `${i.name} ${i.brand} ${i.sku} ${i.barcode || ""} ${i.id || ""}`
            .toLowerCase()
            .includes(search.toLowerCase())
        );

  // ===============================
  // RENDER
  // ===============================
  return (
    <div className="inventory-container">
      {/* SEARCH */}
      <div className="search-row">
        <input
          className="search-box search-box-wide"
          placeholder="Search products by name, brand, SKU, barcode, or ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </div>

      {/* ACTION TILES */}
      <div className="inventory-tiles">
        <div className="tile" onClick={() => setBrandModalOpen(true)}>
          <span className="tile-title">🏷️ Add Brand</span>
          <span className="tile-sub">Manufacturers & reps</span>
        </div>

        <div className="tile primary" onClick={() => setModalOpen(true)}>
          <span className="tile-title">📦 Add Product</span>
          <span className="tile-sub">Master product</span>
        </div>

        <div className="tile" onClick={() => navigate("/inventory/check-in")}>
          <span className="tile-title">📥 Product Check-In</span>
          <span className="tile-sub">Receive inventory</span>
        </div>
      </div>

      {/* TABLE */}
      <div className="table-wrapper">
        <table className="inventory-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Barcode</th>
              <th>Name</th>
              <th>Brand</th>
              <th>Category</th>
              <th>Sell Price</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            {search.trim().length === 0 ? (
              <tr>
                <td colSpan={8} className="empty-state">
                  Start typing to search inventory
                </td>
              </tr>
            ) : filteredItems.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty-state">
                  No matching products found
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => navigate(`/inventory/product/${item.id}`)}
                  style={{ cursor: "pointer" }}
                  title="Click to view checked-in units"
                >
                  <td>{item.sku || "—"}</td>
                  <td>{item.barcode || "—"}</td>
                  <td>{item.name}</td>
                  <td>{item.brand}</td>
                  <td>{item.category}</td>
                  <td>${Number(item.price || 0).toFixed(2)}</td>
                  <td>
                    {item.active === false ? (
                      <span className="status inactive">Inactive</span>
                    ) : (
                      <span className="status active">Active</span>
                    )}
                  </td>

                  <td className="actions-col" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="edit-btn"
                      onClick={() => {
                        setEditingItem(item);
                        setModalOpen(true);
                      }}
                    >
                      Edit
                    </button>
                    <button className="delete-btn" onClick={() => handleDelete(item.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* MODALS */}
      <AddProductModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingItem(null);
        }}
        onSave={handleSaveProduct}
        editingItem={editingItem}
        brands={brands} // ✅ provided so modal doesn't need global reads
      />

      <AddBrandModal
        isOpen={brandModalOpen}
        onClose={() => setBrandModalOpen(false)}
        onSave={handleSaveBrand}
      />
    </div>
  );
}
