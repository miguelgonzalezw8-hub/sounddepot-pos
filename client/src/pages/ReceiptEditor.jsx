import { useState, useEffect } from "react";
import { db, storage } from "../firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

export default function ReceiptEditor() {
  const [loading, setLoading] = useState(true);
  const [savedMsg, setSavedMsg] = useState("");

  const [template, setTemplate] = useState({
    shopName: "",
    address: "",
    phone: "",
    headerMessage: "",
    productWarranty: "",
    laborWarranty: "",
    returnPolicy: "",
    footerText: "",
    logoUrl: "",
    showLogo: true,
    layout: "full",
  });

  /* ================= LOAD TEMPLATE ================= */
  useEffect(() => {
    const load = async () => {
      const refDoc = doc(db, "settings", "receiptTemplate");
      const snap = await getDoc(refDoc);

      if (snap.exists()) {
        setTemplate({
          ...snap.data(),
        });
      } else {
        // First-run defaults
        setTemplate({
          shopName: "Sound Depot",
          address: "Madison, AL",
          phone: "(256) 830-8994",
          headerMessage: "Thank you for your business!",
          productWarranty:
            "All products carry manufacturer warranty unless otherwise noted.",
          laborWarranty:
            "Installation labor is warrantied for 12 months from date of service.",
          returnPolicy:
            "Returns accepted within 7 days on unopened merchandise. Labor is non-refundable.",
          footerText: "Quotes are valid for 7 days unless otherwise noted.",
          logoUrl: "",
          showLogo: true,
          layout: "full",
        });
      }

      setLoading(false);
    };

    load();
  }, []);

  /* ================= SAVE TEMPLATE ================= */
  const saveTemplate = async () => {
    await setDoc(
      doc(db, "settings", "receiptTemplate"),
      {
        ...template,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    setSavedMsg("✅ Receipt template saved");
    setTimeout(() => setSavedMsg(""), 2500);
  };

  /* ================= LOGO UPLOAD (THE IMPORTANT PART) ================= */
  const handleLogoUpload = async (file) => {
    if (!file) return;

    try {
      const storageRef = ref(
        storage,
        `receiptLogos/${Date.now()}_${file.name}`
      );

      // upload file
      await uploadBytes(storageRef, file);

      // get URL
      const url = await getDownloadURL(storageRef);

      // persist to Firestore immediately
      await setDoc(
        doc(db, "settings", "receiptTemplate"),
        {
          logoUrl: url,
          showLogo: true,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // update local state so preview updates instantly
      setTemplate((prev) => ({
        ...prev,
        logoUrl: url,
        showLogo: true,
      }));
    } catch (err) {
      console.error("LOGO UPLOAD FAILED", err);
      alert("Logo upload failed. Check console.");
    }
  };

  if (loading) {
    return <div className="p-6 text-gray-500">Loading receipt editor…</div>;
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">🧾 Receipt Template Editor</h1>
      <p className="text-sm text-gray-500">
        These settings control how receipts and quotes are rendered.
      </p>

      {/* ================= LOGO ================= */}
      <Section title="Logo">
        {template.logoUrl && (
          <img
            src={template.logoUrl}
            alt="Receipt logo"
            className="h-20 object-contain mb-2 border p-2"
          />
        )}

        <input
          type="file"
          accept="image/*"
          onChange={(e) => handleLogoUpload(e.target.files[0])}
        />
      </Section>

      {/* ================= SHOP INFO ================= */}
      <Section title="Shop Information">
        <Input
          label="Shop Name"
          value={template.shopName}
          onChange={(v) => setTemplate({ ...template, shopName: v })}
        />
        <Input
          label="Address"
          value={template.address}
          onChange={(v) => setTemplate({ ...template, address: v })}
        />
        <Input
          label="Phone"
          value={template.phone}
          onChange={(v) => setTemplate({ ...template, phone: v })}
        />
      </Section>

      {/* ================= HEADER ================= */}
      <Section title="Header Message">
        <Textarea
          value={template.headerMessage}
          onChange={(v) =>
            setTemplate({ ...template, headerMessage: v })
          }
        />
      </Section>

      {/* ================= WARRANTIES ================= */}
      <Section title="Warranties">
        <Textarea
          label="Product Warranty"
          value={template.productWarranty}
          onChange={(v) =>
            setTemplate({ ...template, productWarranty: v })
          }
        />
        <Textarea
          label="Labor Warranty"
          value={template.laborWarranty}
          onChange={(v) =>
            setTemplate({ ...template, laborWarranty: v })
          }
        />
      </Section>

      {/* ================= RETURN POLICY ================= */}
      <Section title="Return Policy">
        <Textarea
          value={template.returnPolicy}
          onChange={(v) =>
            setTemplate({ ...template, returnPolicy: v })
          }
        />
      </Section>

      {/* ================= FOOTER ================= */}
      <Section title="Footer Text">
        <Textarea
          value={template.footerText}
          onChange={(v) =>
            setTemplate({ ...template, footerText: v })
          }
        />
      </Section>

      {/* ================= ACTIONS ================= */}
      <div className="flex justify-between items-center pt-4">
        <span className="text-sm text-gray-500">{savedMsg}</span>
        <button
          onClick={saveTemplate}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold"
        >
          💾 Save Template
        </button>
      </div>
    </div>
  );
}

/* ================= UI COMPONENTS ================= */

function Section({ title, children }) {
  return (
    <div className="bg-white border rounded-lg p-4 space-y-3">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function Input({ label, value, onChange }) {
  return (
    <div>
      <label className="text-xs text-gray-500">{label}</label>
      <input
        className="w-full border rounded px-3 py-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function Textarea({ label, value, onChange }) {
  return (
    <div>
      {label && <label className="text-xs text-gray-500">{label}</label>}
      <textarea
        rows={3}
        className="w-full border rounded px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
