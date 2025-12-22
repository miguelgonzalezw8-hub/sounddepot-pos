// src/components/AddProductModal.jsx
import { useState, useEffect } from "react";
import "./AddProductModal.css";

import { db } from "../firebase";
import {
  collection,
  onSnapshot,
  query,
  orderBy
} from "firebase/firestore";

const SPEAKER_SIZES = [
  "2.75",
  "3.5",
  "4",
  "5.25",
  "6.5",
  "6x8",
  "6x9",
  "8"
];

export default function AddProductModal({
  isOpen,
  onClose,
  onSave,
  editingItem
}) {
  const [form, setForm] = useState({
    name: "",
    sku: "",
    barcode: "",       // ✅ ADDED
    brand: "",
    subBrand: "",
    category: "",
    speakerSize: "",   // ✅ ADDED (safe flat field)
    cost: "",
    price: "",
    stock: ""
  });

  const [brands, setBrands] = useState([]);
  const [subbrands, setSubbrands] = useState([]);
  const [showSubbrand, setShowSubbrand] = useState(false);

  /* -------------------------------
     Load brands from Firestore
  -------------------------------- */
  useEffect(() => {
    const q = query(collection(db, "brands"), orderBy("brandName"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setBrands(
        snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data()
        }))
      );
    });

    return () => unsubscribe();
  }, []);

  /* -------------------------------
     Preload form when editing
  -------------------------------- */
  useEffect(() => {
    if (editingItem) {
      setForm({
        name: editingItem.name || "",
        sku: editingItem.sku || "",
        barcode: editingItem.barcode || "",     // ✅ SAFE
        brand: editingItem.brand || "",
        subBrand: editingItem.subBrand || "",
        category: editingItem.category || "",
        speakerSize: editingItem.speakerSize || "", // ✅ SAFE
        cost: editingItem.cost || "",
        price: editingItem.price || "",
        stock: editingItem.stock || ""
      });

      const brand = brands.find(b => b.brandName === editingItem.brand);
      if (brand?.enableSubbrands) {
        setSubbrands(brand.subbrands || []);
        setShowSubbrand(true);
      } else {
        setShowSubbrand(false);
      }
    } else {
      setForm({
        name: "",
        sku: "",
        barcode: "",
        brand: "",
        subBrand: "",
        category: "",
        speakerSize: "",
        cost: "",
        price: "",
        stock: ""
      });
      setShowSubbrand(false);
    }
  }, [editingItem, brands]);

  /* -------------------------------
     Handle brand change
  -------------------------------- */
  const handleBrandChange = (value) => {
    setForm(prev => ({
      ...prev,
      brand: value,
      subBrand: ""
    }));

    const brand = brands.find(b => b.brandName === value);

    if (brand?.enableSubbrands) {
      setSubbrands(brand.subbrands || []);
      setShowSubbrand(true);
    } else {
      setSubbrands([]);
      setShowSubbrand(false);
    }
  };

  const handleChange = (e) => {
    setForm(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSubmit = () => {
    onSave(form);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">
          {editingItem ? "Edit Product" : "Add Product"}
        </h2>

        <div className="modal-grid">
          <input
            name="sku"
            placeholder="SKU"
            value={form.sku}
            onChange={handleChange}
          />

          <input
            name="barcode"
            placeholder="Barcode (scan or type)"   // ✅ NEW
            value={form.barcode}
            onChange={handleChange}
          />

          <input
            name="name"
            placeholder="Product Name"
            value={form.name}
            onChange={handleChange}
          />

          {/* BRAND */}
          <select
            value={form.brand}
            onChange={(e) => handleBrandChange(e.target.value)}
          >
            <option value="">Select Brand</option>
            {brands.map(b => (
              <option key={b.id} value={b.brandName}>
                {b.brandName}
              </option>
            ))}
          </select>

          {/* SUB-BRAND */}
          {showSubbrand && (
            <select
              name="subBrand"
              value={form.subBrand}
              onChange={handleChange}
            >
              <option value="">Select Sub-Brand</option>
              {subbrands.map((sb, i) => (
                <option key={i} value={sb}>
                  {sb}
                </option>
              ))}
            </select>
          )}

          <input
            name="category"
            placeholder="Category"
            value={form.category}
            onChange={handleChange}
          />

          {/* ✅ CONDITIONAL SPEAKER SIZE */}
          {form.category === "Speakers" && (
            <select
              name="speakerSize"
              value={form.speakerSize}
              onChange={handleChange}
            >
              <option value="">Speaker Size</option>
              {SPEAKER_SIZES.map(size => (
                <option key={size} value={size}>
                  {size}"
                </option>
              ))}
            </select>
          )}

          <input
            type="number"
            name="cost"
            placeholder="Cost"
            value={form.cost}
            onChange={handleChange}
          />

          <input
            type="number"
            name="price"
            placeholder="Price"
            value={form.price}
            onChange={handleChange}
          />

          <input
            type="number"
            name="stock"
            placeholder="Stock Qty"
            value={form.stock}
            onChange={handleChange}
          />
        </div>

        <div className="modal-actions">
          <button className="cancel-btn" onClick={onClose}>
            Cancel
          </button>

          <button className="save-btn" onClick={handleSubmit}>
            {editingItem ? "Save Changes" : "Add Product"}
          </button>
        </div>
      </div>
    </div>
  );
}
