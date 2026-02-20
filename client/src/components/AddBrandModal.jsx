// src/components/AddBrandModal.jsx
import { useEffect, useState } from "react";
import "./AddProductModal.css"; // reuse same modal styles

import { db } from "../firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { useSession } from "../session/SessionProvider";

export default function AddBrandModal({ isOpen, onClose, onSave }) {
  const { terminal } = useSession();
  const tenantId = terminal?.tenantId;

  const [brandName, setBrandName] = useState("");
  const [repName, setRepName] = useState("");
  const [repPhone, setRepPhone] = useState("");
  const [repEmail, setRepEmail] = useState("");
  const [enableSubbrands, setEnableSubbrands] = useState(false);
  const [subbrands, setSubbrands] = useState([""]);
  const [saving, setSaving] = useState(false);

  // Reset when opened (keeps the modal clean)
  useEffect(() => {
    if (!isOpen) return;
    setBrandName("");
    setRepName("");
    setRepPhone("");
    setRepEmail("");
    setEnableSubbrands(false);
    setSubbrands([""]);
    setSaving(false);
  }, [isOpen]);

  const updateSubbrand = (index, value) => {
    setSubbrands((prev) => {
      const list = [...prev];
      list[index] = value;
      return list;
    });
  };

  const addSubbrandField = () => setSubbrands((prev) => [...prev, ""]);

  const handleSave = async () => {
    if (saving) return;

    if (!brandName.trim()) {
      alert("Brand name is required.");
      return;
    }

    if (!tenantId) {
      alert("No tenant selected. Please set up the terminal.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        tenantId, // ✅ REQUIRED for rules

        // keep existing fields
        name: brandName.trim(),
        brandName: brandName.trim(),
        repName: repName.trim(),
        repPhone: repPhone.trim(),
        repEmail: repEmail.trim(),

        enableSubbrands,
        subbrands: enableSubbrands
          ? subbrands.map((s) => s.trim()).filter(Boolean)
          : [],

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        active: true,
      };

      // If parent passed an onSave, use it; otherwise write here (same strategy, just flexible)
      if (typeof onSave === "function") {
        await onSave(payload);
      } else {
        await addDoc(collection(db, "brands"), payload);
      }

      onClose?.();
    } catch (err) {
      console.error("Error adding brand:", err);
      alert("Error adding brand.");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="apm-overlay" onClick={onClose}>
      <div className="apm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="apm-header">
          <h2 className="apm-title">Add Brand</h2>
        </div>

        <div className="apm-body">
          <div className="apm-grid">
            <input
              placeholder="Brand Name"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              autoFocus
            />

            <input
              placeholder="Sales Rep Name"
              value={repName}
              onChange={(e) => setRepName(e.target.value)}
            />

            <input
              placeholder="Sales Rep Phone"
              value={repPhone}
              onChange={(e) => setRepPhone(e.target.value)}
            />

            <input
              placeholder="Sales Rep Email"
              value={repEmail}
              onChange={(e) => setRepEmail(e.target.value)}
            />

            <label style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={enableSubbrands}
                onChange={() => setEnableSubbrands((v) => !v)}
              />
              <span style={{ fontSize: 14, fontWeight: 600 }}>Enable Subbrands</span>
            </label>

            {enableSubbrands &&
              subbrands.map((sb, index) => (
                <input
                  key={index}
                  placeholder={`Subbrand ${index + 1}`}
                  value={sb}
                  onChange={(e) => updateSubbrand(index, e.target.value)}
                />
              ))}

            {enableSubbrands && (
              <button
                className="apm-btn apm-save"
                type="button"
                onClick={addSubbrandField}
                disabled={saving}
                style={{ justifySelf: "start", padding: "10px 14px" }}
              >
                + Add Subbrand
              </button>
            )}
          </div>
        </div>

        <div className="apm-footer">
          <button className="apm-btn apm-cancel" onClick={onClose} disabled={saving}>
            Cancel
          </button>

          <button className="apm-btn apm-save" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Brand"}
          </button>
        </div>
      </div>
    </div>
  );
}







