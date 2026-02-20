// src/components/AddProductModal.jsx
import { useState, useEffect } from "react";
import "./AddProductModal.css";

import { db, storage } from "../firebase";
import { collection, onSnapshot, query, orderBy, where } from "firebase/firestore";

import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";

import { useSession } from "../session/SessionProvider";

const SPEAKER_SIZES = ["2.75", "3.5", "4", "5.25", "6.5", "6x8", "6x9", "8"];

export default function AddProductModal({
  isOpen,
  onClose,
  onSave,
  editingItem,
  brands: brandsProp, // ✅ optional (Inventory can pass tenant-scoped brands)
}) {
  const { terminal, booting } = useSession();
  const tenantId = terminal?.tenantId;

  /* ================= STATE ================= */
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "",
    sku: "",
    barcode: "",
    brand: "",
    subBrand: "",
    category: "",
    speakerSize: "",
    cost: "",
    price: "",
    stock: "",
    imageUrl: null,
    imagePath: "",
  });

  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  const [brands, setBrands] = useState([]);
  const [subbrands, setSubbrands] = useState([]);
  const [showSubbrand, setShowSubbrand] = useState(false);

  // Prefer passed-in tenant brands (same strategy), otherwise load tenant-scoped here.
  useEffect(() => {
    if (Array.isArray(brandsProp) && brandsProp.length >= 0) {
      setBrands(brandsProp);
    }
  }, [brandsProp]);

  /* -------------------------------
     Load brands from Firestore (TENANT-SCOPED)
     (Only used if parent doesn't pass brands)
  -------------------------------- */
  useEffect(() => {
    if (Array.isArray(brandsProp)) return; // parent is providing it
    if (booting) return;
    if (!tenantId) return;

    const qy = query(
      collection(db, "brands"),
      where("tenantId", "==", tenantId),
      orderBy("brandName")
    );

    const unsubscribe = onSnapshot(
      qy,
      (snapshot) => {
        setBrands(
          snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }))
        );
      },
      (err) => console.error("[AddProductModal brands] permission/index error:", err)
    );

    return () => unsubscribe();
  }, [brandsProp, booting, tenantId]);

  /* -------------------------------
     Preload form when editing / reset when adding
  -------------------------------- */
  useEffect(() => {
    // cleanup blob preview when switching items
    if (imagePreview?.startsWith?.("blob:")) {
      try {
        URL.revokeObjectURL(imagePreview);
      } catch {}
    }

    if (editingItem) {
      setForm({
        name: editingItem.name || "",
        sku: editingItem.sku || "",
        barcode: editingItem.barcode || "",
        brand: editingItem.brand || "",
        subBrand: editingItem.subBrand || "",
        category: editingItem.category || "",
        speakerSize: editingItem.speakerSize || "",
        cost: editingItem.cost || "",
        price: editingItem.price || "",
        stock: editingItem.stock || "",
        imageUrl: editingItem.imageUrl || null,
        imagePath: editingItem.imagePath || "",
      });

      setImageFile(null);
      setImagePreview(editingItem.imageUrl || null);

      const brand = brands.find((b) => (b.brandName || b.name) === editingItem.brand);
      if (brand?.enableSubbrands) {
        setSubbrands(brand.subbrands || []);
        setShowSubbrand(true);
      } else {
        setSubbrands([]);
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
        stock: "",
        imageUrl: null,
        imagePath: "",
      });
      setImageFile(null);
      setImagePreview(null);
      setSubbrands([]);
      setShowSubbrand(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingItem, brands]);

  /* -------------------------------
     Cleanup blob preview on unmount
  -------------------------------- */
  useEffect(() => {
    return () => {
      if (imagePreview?.startsWith?.("blob:")) {
        try {
          URL.revokeObjectURL(imagePreview);
        } catch {}
      }
    };
  }, [imagePreview]);

  /* -------------------------------
     Handlers
  -------------------------------- */
  const handleBrandChange = (value) => {
    setForm((prev) => ({
      ...prev,
      brand: value,
      subBrand: "",
    }));

    const brand = brands.find((b) => (b.brandName || b.name) === value);

    if (brand?.enableSubbrands) {
      setSubbrands(brand.subbrands || []);
      setShowSubbrand(true);
    } else {
      setSubbrands([]);
      setShowSubbrand(false);
    }
  };

  const handleChange = (e) => {
    setForm((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  /* -------------------------------
     Upload helper (resumable)
  -------------------------------- */
  const uploadImageResumable = (file, path) => {
    return new Promise((resolve, reject) => {
      try {
        const imageRef = ref(storage, path);

        const uploadTask = uploadBytesResumable(imageRef, file, {
          contentType: file.type || "image/jpeg",
          cacheControl: "public,max-age=31536000",
        });

        uploadTask.on(
          "state_changed",
          null,
          (error) => {
            console.error("UPLOAD ERROR (raw):", error);
            console.error("UPLOAD ERROR code:", error?.code);
            console.error("UPLOAD ERROR message:", error?.message);
            console.error(
              "UPLOAD ERROR serverResponse:",
              error?.customData?.serverResponse || error?.serverResponse
            );
            reject(error);
          },
          async () => {
            try {
              const url = await getDownloadURL(uploadTask.snapshot.ref);
              resolve(url);
            } catch (e) {
              reject(e);
            }
          }
        );
      } catch (e) {
        reject(e);
      }
    });
  };

  /* -------------------------------
     Save (with image upload + replace old file)
     ✅ Ensure tenantId is included (rules)
  -------------------------------- */
  const handleSubmit = async () => {
    if (saving) return;

    if (!tenantId) {
      alert("No tenant selected. Please set up the terminal.");
      return;
    }

    setSaving(true);

    try {
      let imageUrl = form.imageUrl || null;
      let imagePath = form.imagePath || "";

      // If user selected a new file, upload it
      if (imageFile) {
        const safeName = imageFile.name
          .replace(/\s+/g, "_")
          .replace(/[^a-zA-Z0-9._-]/g, "");

        const groupKey = editingItem?.id ? editingItem.id : "new";
        const newPath = `products/${groupKey}/${Date.now()}-${safeName}`;

        imageUrl = await uploadImageResumable(imageFile, newPath);
        imagePath = newPath;

        // best-effort delete old image when editing
        if (editingItem?.imagePath && editingItem.imagePath !== newPath) {
          try {
            await deleteObject(ref(storage, editingItem.imagePath));
          } catch (e) {
            console.warn("Old image delete failed:", e?.message || e);
          }
        }
      }

      await onSave({
        ...form,
        tenantId, // ✅ REQUIRED
        imageUrl,
        imagePath,
      });
    } catch (err) {
      console.error("Image save failed:", err);
      alert("Failed to save product (image upload).");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  /* ================= UI ================= */
  return (
    <div className="apm-overlay" onClick={onClose}>
      <div className="apm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="apm-header">
          <h2 className="apm-title">
            {editingItem ? "Edit Product" : "Add Product"}
          </h2>
        </div>

        <div className="apm-body">
          <div className="apm-grid">
            <input
              name="sku"
              placeholder="SKU"
              value={form.sku}
              onChange={handleChange}
            />

            <input
              name="barcode"
              placeholder="Barcode (scan or type)"
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
              {brands.map((b) => (
                <option key={b.id} value={b.brandName || b.name}>
                  {b.brandName || b.name}
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

            {/* SPEAKER SIZE */}
            {form.category === "Speakers" && (
              <select
                name="speakerSize"
                value={form.speakerSize}
                onChange={handleChange}
              >
                <option value="">Speaker Size</option>
                {SPEAKER_SIZES.map((size) => (
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

            {/* IMAGE UPLOAD */}
            <div className="apm-imageRow">
              <label className="apm-imageLabel">Product Image</label>

              <input
                className="apm-file"
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;

                  // cleanup prior blob preview
                  if (imagePreview?.startsWith?.("blob:")) {
                    try {
                      URL.revokeObjectURL(imagePreview);
                    } catch {}
                  }

                  setImageFile(file);
                  setImagePreview(URL.createObjectURL(file));
                }}
              />

              {imagePreview && (
                <div className="apm-previewWrap">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="apm-preview"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="apm-footer">
          <button className="apm-btn apm-cancel" onClick={onClose}>
            Cancel
          </button>

          <button
            className="apm-btn apm-save"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? "Saving..." : editingItem ? "Save Changes" : "Add Product"}
          </button>
        </div>
      </div>
    </div>
  );
}







