import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./Inventory.css";

import AddProductModal from "../components/AddProductModal";
import AddBrandModal from "../components/AddBrandModal";

// FIREBASE
import {
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";

import { db } from "../firebase";

export default function Inventory() {
  const navigate = useNavigate();

  // ===============================
  // STATE
  // ===============================
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [brandModalOpen, setBrandModalOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [editingItem, setEditingItem] = useState(null);

  // ===============================
  // SAVE PRODUCT (MASTER PRODUCT)
  // ===============================
  const handleSaveProduct = async (product) => {
    try {
      const payload = {
        ...product,
        price: Number(product.price) || 0,
        stock: Number(product.stock) || 0, // TEMP – derived later
        updatedAt: serverTimestamp(),
      };

      if (editingItem) {
        await updateDoc(doc(db, "products", editingItem.id), payload);
        alert("Product updated");
        setEditingItem(null);
      } else {
        await addDoc(collection(db, "products"), {
          ...payload,
          createdAt: serverTimestamp(),
          active: true,
        });
        alert("Product added");
      }

      setModalOpen(false);
    } catch (err) {
      console.error(err);
      alert("Failed to save product");
    }
  };

  // ===============================
  // SAVE BRAND
  // ===============================
  const handleSaveBrand = async (brand) => {
    try {
      await addDoc(collection(db, "brands"), {
        ...brand,
        createdAt: serverTimestamp(),
      });
      alert("Brand added");
      setBrandModalOpen(false);
    } catch (err) {
      console.error(err);
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
      console.error(err);
      alert("Delete failed");
    }
  };

  // ===============================
  // LOAD PRODUCTS (MASTER LIST)
  // ===============================
  useEffect(() => {
    const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setItems(
        snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
      );
    });

    return () => unsubscribe();
  }, []);

  // ===============================
  // FILTER SEARCH
  // ===============================
  const filteredItems =
    search.trim().length === 0
      ? []
      : items.filter((i) =>
          `${i.name} ${i.brand} ${i.sku} ${i.barcode || ""}`
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
          placeholder="Search products by name, brand, SKU, or barcode..."
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

        {/* ✅ FIXED: REAL NAVIGATION */}
        <div
          className="tile"
          onClick={() => navigate("/inventory/check-in")}
        >
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
                <tr key={item.id}>
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
                  <td className="actions-col">
                    <button
                      className="edit-btn"
                      onClick={() => {
                        setEditingItem(item);
                        setModalOpen(true);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="delete-btn"
                      onClick={() => handleDelete(item.id)}
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

      {/* MODALS */}
      <AddProductModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingItem(null);
        }}
        onSave={handleSaveProduct}
        editingItem={editingItem}
      />

      <AddBrandModal
        isOpen={brandModalOpen}
        onClose={() => setBrandModalOpen(false)}
        onSave={handleSaveBrand}
      />
    </div>
  );
}
