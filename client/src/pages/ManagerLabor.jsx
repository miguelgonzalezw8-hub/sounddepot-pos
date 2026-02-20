// client/src/pages/ManagerLabor.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { useSession } from "../session/SessionProvider";
import {
  collection,
  doc,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  getDoc,
} from "firebase/firestore";

function money(n) {
  const x = Number(n || 0);
  return x.toLocaleString(undefined, { style: "currency", currency: "USD" });
}
function num(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export default function ManagerLabor() {
  const navigate = useNavigate();
  const { terminal, devMode, posAccount } = useSession();

  const tenantId = terminal?.tenantId || null;
  const shopId = terminal?.shopId || null;

  // ✅ OWNER TERMINAL BYPASS (matches RequireManagerPin behavior)
  const isOwnerTerminal = terminal?.mode === "owner";

  const role = useMemo(
    () => String(posAccount?.role || "").toLowerCase(),
    [posAccount?.role]
  );

  const isManager = useMemo(() => {
    if (devMode) return true;
    if (isOwnerTerminal) return true; // ✅ owner terminal should never require PIN
    return role === "owner" || role === "manager";
  }, [devMode, isOwnerTerminal, role]);

  // settings live on shops/{shopId}
  const [laborMode, setLaborMode] = useState("catalog"); // "catalog" | "sku"
  const [laborSkuProductId, setLaborSkuProductId] = useState("");

  // products list for SKU mode dropdown
  const [products, setProducts] = useState([]);

  // labor catalog
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");

  // create/edit modal-ish inline editor (keeps UI simple)
  const [editing, setEditing] = useState(null); // {id, ...data} or null
  const [form, setForm] = useState({
    name: "",
    pricingModel: "flat", // flat | hourly
    flatAmount: 149,
    hourlyRate: 110,
    defaultHours: 1.5,
    taxable: false,
    commissionable: true,
    active: true,
  });

  useEffect(() => {
    if (!tenantId || !shopId) return;
    if (!isManager) return;

    // load current shop labor settings
    (async () => {
      const snap = await getDoc(doc(db, "shops", shopId));
      if (snap.exists()) {
        const d = snap.data() || {};
        if (d.laborMode) setLaborMode(String(d.laborMode));
        if (d.laborSkuProductId) setLaborSkuProductId(String(d.laborSkuProductId));
      }
    })();
  }, [tenantId, shopId, isManager]);

  useEffect(() => {
    if (!tenantId || !shopId) return;
    if (!isManager) return;

    // products for SKU selection (tenant-scoped)
    const qy = query(
      collection(db, "products"),
      where("tenantId", "==", tenantId),
      where("active", "==", true)
    );
    return onSnapshot(
      qy,
      (snap) => setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("[ManagerLabor products] error:", err)
    );
  }, [tenantId, shopId, isManager]);

  useEffect(() => {
    if (!tenantId || !shopId) return;
    if (!isManager) return;

    // labor catalog is shop scoped (recommended) + tenant guard
    const qy = query(
      collection(db, "shops", shopId, "laborCatalog"),
      where("tenantId", "==", tenantId)
    );

    return onSnapshot(
      qy,
      (snap) => setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("[ManagerLabor laborCatalog] error:", err)
    );
  }, [tenantId, shopId, isManager]);

  if (!devMode && !isManager) {
    return (
      <div className="inventory-container">
        <div className="search-row" style={{ display: "flex", gap: 8 }}>
          <button className="search-box" onClick={() => navigate(-1)} style={{ width: 120 }}>
            ← Back
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>Labor</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Manager-only</div>
          </div>
        </div>
        <div className="empty-state">Not authorized.</div>
      </div>
    );
  }

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const base = [...rows].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    if (!s) return base;
    return base.filter((r) => String(r.name || "").toLowerCase().includes(s));
  }, [rows, search]);

  const resetForm = () => {
    setEditing(null);
    setForm({
      name: "",
      pricingModel: "flat",
      flatAmount: 149,
      hourlyRate: 110,
      defaultHours: 1.5,
      taxable: false,
      commissionable: true,
      active: true,
    });
  };

  const openCreate = () => {
    resetForm();
    setEditing({ id: null });
  };

  const openEdit = (row) => {
    setEditing({ id: row.id });
    setForm({
      name: row.name || "",
      pricingModel: row.pricingModel || "flat",
      flatAmount: num(row.flatAmount ?? 149),
      hourlyRate: num(row.hourlyRate ?? 110),
      defaultHours: num(row.defaultHours ?? 1.5),
      taxable: !!row.taxable,
      commissionable: row.commissionable !== false,
      active: row.active !== false,
    });
  };

  const saveSettings = async () => {
    if (!tenantId || !shopId) return;

    const payload = {
      tenantId,
      laborMode: laborMode === "sku" ? "sku" : "catalog",
      laborSkuProductId: laborMode === "sku" ? (laborSkuProductId || "") : "",
      updatedAt: serverTimestamp(),
    };

    await updateDoc(doc(db, "shops", shopId), payload);
    alert("Labor settings saved.");
  };

  const saveLabor = async () => {
    if (!tenantId || !shopId) return;

    const payload = {
      tenantId,
      shopId,
      name: String(form.name || "").trim(),
      pricingModel: form.pricingModel === "hourly" ? "hourly" : "flat",

      flatAmount: num(form.flatAmount),
      hourlyRate: num(form.hourlyRate),
      defaultHours: num(form.defaultHours),

      taxable: !!form.taxable,
      commissionable: !!form.commissionable,
      active: !!form.active,

      updatedAt: serverTimestamp(),
      ...(editing?.id ? {} : { createdAt: serverTimestamp() }),
    };

    if (!payload.name) {
      alert("Name is required.");
      return;
    }

    if (payload.pricingModel === "flat" && payload.flatAmount <= 0) {
      alert("Flat amount must be > 0.");
      return;
    }
    if (payload.pricingModel === "hourly" && (payload.hourlyRate <= 0 || payload.defaultHours <= 0)) {
      alert("Hourly rate and default hours must be > 0.");
      return;
    }

    if (!editing?.id) {
      await addDoc(collection(db, "shops", shopId, "laborCatalog"), payload);
    } else {
      await updateDoc(doc(db, "shops", shopId, "laborCatalog", editing.id), payload);
    }

    resetForm();
  };

  const deleteLabor = async (id) => {
    if (!id) return;
    if (!confirm("Delete this labor service?")) return;
    await deleteDoc(doc(db, "shops", shopId, "laborCatalog", id));
  };

  return (
    <div className="inventory-container">
      <div className="search-row" style={{ display: "flex", gap: 8 }}>
        <button className="search-box" onClick={() => navigate(-1)} style={{ width: 120 }}>
          ← Back
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Labor</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Shop labor settings + catalog</div>
          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
            Mode: <b>{laborMode === "sku" ? "Labor SKU (override)" : "Catalog (Shopmonkey)"}</b>
          </div>
        </div>
      </div>

      {/* SETTINGS */}
      <div className="bg-app-panel dark:bg-app-panel p-4 rounded-xl shadow border" style={{ marginTop: 10 }}>
        <div style={{ fontWeight: 900, marginBottom: 6 }}>Labor Mode</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button
            className="search-box"
            onClick={() => setLaborMode("catalog")}
            style={{
              borderRadius: 12,
              border: laborMode === "catalog" ? "2px solid #0ea5e9" : "1px solid rgba(0,0,0,0.12)",
              background: laborMode === "catalog" ? "rgba(14,165,233,0.08)" : "white",
              padding: 12,
              textAlign: "left",
            }}
          >
            <div style={{ fontWeight: 900 }}>Catalog </div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Standard services with defaults. Counter can still override price (Option 2).
            </div>
          </button>

          <button
            className="search-box"
            onClick={() => setLaborMode("sku")}
            style={{
              borderRadius: 12,
              border: laborMode === "sku" ? "2px solid #0ea5e9" : "1px solid rgba(0,0,0,0.12)",
              background: laborMode === "sku" ? "rgba(14,165,233,0.08)" : "white",
              padding: 12,
              textAlign: "left",
            }}
          >
            <div style={{ fontWeight: 900 }}>Labor SKU </div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              One labor product SKU. Edit price per ticket to match the quote.
            </div>
          </button>
        </div>

        {laborMode === "sku" && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
              Select which Product is your Labor SKU:
            </div>

            <select
              value={laborSkuProductId}
              onChange={(e) => setLaborSkuProductId(e.target.value)}
              className="h-10 px-2 rounded-lg border w-full"
            >
              <option value="">Select labor product…</option>
              {products
                .slice()
                .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.sku ? `(${p.sku})` : ""}
                  </option>
                ))}
            </select>

            <div style={{ fontSize: 12, opacity: 0.6, marginTop: 6 }}>
              Tip: create a product like “Labor” with SKU “LABOR”. It should NOT track serials.
            </div>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button className="search-box" onClick={saveSettings} style={{ width: 160, fontWeight: 800 }}>
            Save Settings
          </button>
        </div>
      </div>

      {/* CATALOG */}
      <div className="bg-app-panel dark:bg-app-panel p-4 rounded-xl shadow border" style={{ marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 900 }}>Labor Catalog</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Used when mode is Catalog. (Counter can override price in Sell.)
            </div>
          </div>

          <button className="search-box" onClick={openCreate} style={{ width: 160, fontWeight: 800 }}>
            + Add Labor
          </button>
        </div>

        <input
          placeholder="Search labor…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-11 px-3 rounded-lg border"
          style={{ marginTop: 10 }}
        />

        <div style={{ marginTop: 10 }}>
          {filtered.length === 0 ? (
            <div className="empty-state">No labor services yet.</div>
          ) : (
            filtered.map((r) => {
              const label =
                r.pricingModel === "hourly"
                  ? `${money(r.hourlyRate)} / hr • ${num(r.defaultHours)} hrs (default)`
                  : `${money(r.flatAmount)} flat`;

              return (
                <div
                  key={r.id}
                  style={{
                    borderBottom: "1px solid rgba(0,0,0,0.08)",
                    padding: "10px 0",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 900, display: "flex", gap: 8, alignItems: "center" }}>
                      <span>{r.name}</span>
                      {r.active === false && <span style={{ fontSize: 11, opacity: 0.7 }}>(inactive)</span>}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      {label}
                      {" • "}
                      Taxable: {r.taxable ? "Yes" : "No"}
                      {" • "}
                      Commission: {r.commissionable === false ? "No" : "Yes"}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="search-box" onClick={() => openEdit(r)} style={{ width: 90 }}>
                      Edit
                    </button>
                    <button
                      className="search-box"
                      onClick={() => deleteLabor(r.id)}
                      style={{ width: 90, color: "#b91c1c" }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* EDITOR (simple inline panel) */}
      {editing && (
        <div className="bg-app-panel dark:bg-app-panel p-4 rounded-xl shadow border" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>{editing.id ? "Edit Labor" : "New Labor"}</div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Name</div>
              <input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="w-full h-11 px-3 rounded-lg border"
                placeholder="Radio Install"
              />
            </div>

            <div>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Pricing Model</div>
              <select
                value={form.pricingModel}
                onChange={(e) => setForm((p) => ({ ...p, pricingModel: e.target.value }))}
                className="w-full h-11 px-3 rounded-lg border"
              >
                <option value="flat">Flat</option>
                <option value="hourly">Hourly</option>
              </select>
            </div>

            {form.pricingModel === "flat" ? (
              <div>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Flat Amount</div>
                <input
                  value={form.flatAmount}
                  onChange={(e) => setForm((p) => ({ ...p, flatAmount: e.target.value }))}
                  className="w-full h-11 px-3 rounded-lg border"
                  placeholder="149"
                />
              </div>
            ) : (
              <>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Hourly Rate</div>
                  <input
                    value={form.hourlyRate}
                    onChange={(e) => setForm((p) => ({ ...p, hourlyRate: e.target.value }))}
                    className="w-full h-11 px-3 rounded-lg border"
                    placeholder="110"
                  />
                </div>

                <div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Default Hours</div>
                  <input
                    value={form.defaultHours}
                    onChange={(e) => setForm((p) => ({ ...p, defaultHours: e.target.value }))}
                    className="w-full h-11 px-3 rounded-lg border"
                    placeholder="1.5"
                  />
                </div>
              </>
            )}

            <div>
              <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                <input
                  type="checkbox"
                  checked={!!form.taxable}
                  onChange={(e) => setForm((p) => ({ ...p, taxable: e.target.checked }))}
                />
                <span style={{ fontSize: 13 }}>Taxable</span>
              </label>
            </div>

            <div>
              <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                <input
                  type="checkbox"
                  checked={!!form.commissionable}
                  onChange={(e) => setForm((p) => ({ ...p, commissionable: e.target.checked }))}
                />
                <span style={{ fontSize: 13 }}>Commissionable</span>
              </label>
            </div>

            <div className="md:col-span-2">
              <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                <input
                  type="checkbox"
                  checked={!!form.active}
                  onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
                />
                <span style={{ fontSize: 13 }}>Active</span>
              </label>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <button className="search-box" onClick={resetForm} style={{ width: 120 }}>
              Cancel
            </button>
            <button className="search-box" onClick={saveLabor} style={{ width: 140, fontWeight: 900 }}>
              Save Labor
            </button>
          </div>
        </div>
      )}
    </div>
  );
}







