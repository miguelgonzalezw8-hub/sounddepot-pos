import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { useSession } from "../session/SessionProvider";

export default function CustomerDetail() {
  const navigate = useNavigate();
  const { id } = useParams();

  const { terminal, booting } = useSession();
  const tenantId = terminal?.tenantId;

  const isNew = (id || "").toLowerCase() === "new";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [customer, setCustomer] = useState(null);

  const [companyName, setCompanyName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [type, setType] = useState("Retail");
  const [notes, setNotes] = useState("");

  const title = useMemo(() => {
    if (isNew) return "Add Customer";
    if (!customer) return "Customer";
    return (
      customer.companyName ||
      `${customer.firstName || ""} ${customer.lastName || ""}`.trim() ||
      "Customer"
    );
  }, [customer, isNew]);

  useEffect(() => {
    if (booting) return;
    if (!tenantId) return;

    // ✅ CREATE MODE: no read
    if (isNew) {
      setCustomer(null);
      setCompanyName("");
      setFirstName("");
      setLastName("");
      setPhone("");
      setEmail("");
      setType("Retail");
      setNotes("");
      setErr("");
      setLoading(false);
      return;
    }

    if (!id) return;

    (async () => {
      setLoading(true);
      setErr("");
      try {
        const ref = doc(db, "customers", id);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          setCustomer(null);
          setErr("Customer not found.");
          return;
        }

        const data = { id: snap.id, ...snap.data() };

        // extra safety
        if (data.tenantId && data.tenantId !== tenantId) {
          setCustomer(null);
          setErr("Not authorized.");
          return;
        }

        setCustomer(data);
        setCompanyName(data.companyName || "");
        setFirstName(data.firstName || "");
        setLastName(data.lastName || "");
        setPhone(data.phone || "");
        setEmail(data.email || "");
        setType(data.type || "Retail");
        setNotes(data.notes || "");
      } catch (e) {
        console.error(e);
        setErr(e?.message?.includes("permission") ? "Permission denied." : "Failed to load customer.");
      } finally {
        setLoading(false);
      }
    })();
  }, [booting, tenantId, id, isNew]);

  const onSave = async () => {
    if (booting) return;
    if (!tenantId) {
      setErr("Terminal not set up (missing tenant).");
      return;
    }

    setSaving(true);
    setErr("");
    try {
      const payload = {
        tenantId,
        companyName: companyName || "",
        firstName: firstName || "",
        lastName: lastName || "",
        phone: phone || "",
        email: email || "",
        type: type || "Retail",
        notes: notes || "",
        updatedAt: serverTimestamp(),
      };

      if (isNew) {
        // ✅ CREATE
        const ref = await addDoc(collection(db, "customers"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        navigate(`/customers/${ref.id}`);
      } else {
        // ✅ UPDATE
        await updateDoc(doc(db, "customers", id), payload);
        navigate(-1);
      }
    } catch (e) {
      console.error(e);
      setErr(e?.message?.includes("permission") ? "Permission denied." : "Failed to save customer.");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (isNew) return;
    if (!window.confirm("Delete this customer?")) return;

    setSaving(true);
    setErr("");
    try {
      await deleteDoc(doc(db, "customers", id));
      navigate("/customers");
    } catch (e) {
      console.error(e);
      setErr(e?.message?.includes("permission") ? "Permission denied." : "Failed to delete customer.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="inventory-container">
      <div className="search-row" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="search-box" style={{ width: 120 }} onClick={() => navigate(-1)}>
          ← Back
        </button>

        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>{title}</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>{isNew ? "Create a new customer" : "Customer details"}</div>
        </div>

        <button className="save-btn" onClick={onSave} disabled={saving || loading}>
          {saving ? "Saving..." : "Save"}
        </button>

        {!isNew && (
          <button className="search-box" style={{ width: 110 }} onClick={onDelete} disabled={saving || loading}>
            Delete
          </button>
        )}
      </div>

      {err && (
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
          {err}
        </div>
      )}

      {loading ? (
        <div className="empty-state" style={{ marginTop: 16 }}>
          Loading...
        </div>
      ) : (
        <div className="bg-app-panel dark:bg-app-panel dark:bg-brand-primary rounded-xl border shadow-sm p-4 mt-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input className="search-box" placeholder="Company Name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            <input className="search-box" placeholder="Type (Retail/Commercial)" value={type} onChange={(e) => setType(e.target.value)} />
            <input className="search-box" placeholder="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            <input className="search-box" placeholder="Last Name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            <input className="search-box" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <input className="search-box" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <textarea
            className="search-box"
            style={{ minHeight: 110, width: "100%" }}
            placeholder="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          {!isNew && (
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Customer ID: <span style={{ fontFamily: "monospace" }}>{id}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}







