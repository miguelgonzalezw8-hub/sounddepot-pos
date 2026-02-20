// client/src/pages/ManagerBundleEditor.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useSession } from "../session/SessionProvider";
import { makeVehicleKey } from "../utils/vehicleKey";

// ✅ Reuse your existing fitment dropdown sources (NO vehicleCatalog needed)
import {
  getYearOptions,
  getMakeOptions,
  getModelOptions,
} from "../utils/fitmentEngine";

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function uniq(arr) {
  return [...new Set(arr)];
}

function toggleInArray(arr, val) {
  const v = String(val || "");
  if (!v) return arr;
  if (arr.includes(v)) return arr.filter((x) => x !== v);
  return [...arr, v];
}

function toggleInArrayNum(arr, val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return arr;
  if (arr.includes(n)) return arr.filter((x) => x !== n);
  return [...arr, n];
}

function Chip({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid rgba(0,0,0,0.10)",
        background: "white",
        fontSize: 12,
        fontWeight: 700,
        opacity: 0.95,
      }}
      title="Click to remove"
    >
      <span>{label}</span>
      <span style={{ fontWeight: 900, opacity: 0.6 }}>✕</span>
    </button>
  );
}

export default function ManagerBundleEditor() {
  const navigate = useNavigate();
  const { bundleId } = useParams();

  const isNew = bundleId === undefined || bundleId === "new";

  const { terminal, booting } = useSession();
  const tenantId = terminal?.tenantId || null;
  const shopId = terminal?.shopId || null;

  const bundlesRef = useMemo(() => {
    if (!shopId) return null;
    return collection(db, "shops", shopId, "bundles");
  }, [shopId]);

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [bundlePrice, setBundlePrice] = useState("0");
  const [active, setActive] = useState(true);
  const [items, setItems] = useState([]);

  // Stored vehicle keys
  const [vehicleKeys, setVehicleKeys] = useState([]);

  // ===== Bulk Vehicle Builder (click-to-toggle) =====
  const [yearOptions, setYearOptions] = useState([]);
  const [makeOptions, setMakeOptionsState] = useState([]);
  const [modelOptions, setModelOptionsState] = useState([]);

  // selected sets
  const [yearSel, setYearSel] = useState([]); // [2015,2016,...]
  const [makeSel, setMakeSel] = useState([]); // ["Ford"]
  const [modelSel, setModelSel] = useState([]); // ["F-150","Explorer"]

  // dropdown pickers (single-select) for click-to-toggle
  const [yearPick, setYearPick] = useState("");
  const [makePick, setMakePick] = useState("");
  const [modelPick, setModelPick] = useState("");

  // year range helper
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");

  // Manual single add fallback (kept)
  const [vYear, setVYear] = useState("");
  const [vMake, setVMake] = useState("");
  const [vModel, setVModel] = useState("");
  const [vTrim, setVTrim] = useState("");

  // Item add inputs
  const [newProductId, setNewProductId] = useState("");
  const [newQty, setNewQty] = useState("1");

  // ===== Load bundle (edit) =====
  useEffect(() => {
    if (booting) return;
    if (!tenantId || !shopId) return;

    const run = async () => {
      if (isNew) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const ref = doc(db, "shops", shopId, "bundles", bundleId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          alert("Bundle not found.");
          navigate("/manager/bundles");
          return;
        }

        const d = snap.data() || {};
        setName(d.name || "");
        setSku(d.sku || "");
        setBundlePrice(String(d.bundlePrice ?? 0));
        setActive(Boolean(d.active ?? true));
        setItems(Array.isArray(d.items) ? d.items : []);
        setVehicleKeys(Array.isArray(d.vehicleKeys) ? d.vehicleKeys : []);
      } catch (e) {
        console.error("[ManagerBundleEditor] load error:", e);
        alert("Failed to load bundle.");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [booting, tenantId, shopId, bundleId, isNew, navigate]);

  // ===== Load Year Options from fitmentEngine =====
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const yrs = await getYearOptions();
        const clean = Array.from(
          new Set(
            (yrs || [])
              .map((y) => Math.floor(Number(y)))
              .filter((y) => Number.isInteger(y))
          )
        ).sort((a, b) => b - a);

        if (!cancelled) setYearOptions(clean);
      } catch (e) {
        console.error("[BundleEditor] getYearOptions failed:", e);
        if (!cancelled) setYearOptions([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ===== When years change, load makes as UNION of all selected years =====
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!yearSel.length) {
          setMakeOptionsState([]);
          setMakeSel([]);
          setMakePick("");
          setModelOptionsState([]);
          setModelSel([]);
          setModelPick("");
          return;
        }

        const yearNums = yearSel.map((y) => Number(y)).filter((n) => Number.isFinite(n));
        const lists = await Promise.all(yearNums.map((y) => getMakeOptions(y)));

        const allMakes = uniq((lists || []).flat().filter(Boolean)).sort((a, b) =>
          String(a).localeCompare(String(b))
        );

        if (cancelled) return;

        setMakeOptionsState(allMakes);

        // prune selections no longer valid
        setMakeSel((prev) => prev.filter((m) => allMakes.includes(m)));
        setMakePick("");
      } catch (e) {
        console.error("[BundleEditor] getMakeOptions union failed:", e);
        if (cancelled) return;
        setMakeOptionsState([]);
        setMakeSel([]);
        setMakePick("");
        setModelOptionsState([]);
        setModelSel([]);
        setModelPick("");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [yearSel]);

  // ===== When years OR makes change, load models as UNION across (year, make) pairs =====
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!yearSel.length || !makeSel.length) {
          setModelOptionsState([]);
          setModelSel([]);
          setModelPick("");
          return;
        }

        const yearNums = yearSel.map((y) => Number(y)).filter((n) => Number.isFinite(n));
        const makes = makeSel.map((m) => String(m)).filter(Boolean);

        const jobs = [];
        for (const y of yearNums) {
          for (const mk of makes) {
            jobs.push(getModelOptions(y, mk));
          }
        }

        const lists = await Promise.all(jobs);
        const allModels = uniq((lists || []).flat().filter(Boolean)).sort((a, b) =>
          String(a).localeCompare(String(b))
        );

        if (cancelled) return;

        setModelOptionsState(allModels);

        // prune invalid model selections
        setModelSel((prev) => prev.filter((m) => allModels.includes(m)));
        setModelPick("");
      } catch (e) {
        console.error("[BundleEditor] getModelOptions union failed:", e);
        if (cancelled) return;
        setModelOptionsState([]);
        setModelSel([]);
        setModelPick("");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [yearSel, makeSel]);

  // ===== Click-to-toggle handlers (from dropdown pickers) =====
  const onPickYear = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    setYearSel((prev) => toggleInArrayNum(prev, n).sort((a, b) => b - a));
    setYearPick("");
  };

  const onPickMake = (v) => {
    if (!v) return;
    setMakeSel((prev) => toggleInArray(prev, v).sort((a, b) => a.localeCompare(b)));
    setMakePick("");
  };

  const onPickModel = (v) => {
    if (!v) return;
    setModelSel((prev) => toggleInArray(prev, v).sort((a, b) => a.localeCompare(b)));
    setModelPick("");
  };

  const applyYearRange = () => {
    const from = Math.floor(toNumber(yearFrom));
    const to = Math.floor(toNumber(yearTo));
    if (!from || !to) {
      alert("Enter Year From and Year To.");
      return;
    }
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);

    const yrs = yearOptions.filter((y) => y >= lo && y <= hi);
    if (!yrs.length) {
      alert("No years found in that range.");
      return;
    }
    setYearSel((prev) => uniq([...prev, ...yrs]).sort((a, b) => b - a));
  };

  const clearSelections = () => {
    setYearSel([]);
    setMakeSel([]);
    setModelSel([]);
    setMakeOptionsState([]);
    setModelOptionsState([]);
    setYearFrom("");
    setYearTo("");
    setYearPick("");
    setMakePick("");
    setModelPick("");
  };

  // ===== Bundle Items =====
  const addItem = () => {
    const pid = String(newProductId || "").trim();
    const qty = Math.max(1, Math.floor(toNumber(newQty)));

    if (!pid) {
      alert("Enter a Product ID.");
      return;
    }

    const idx = items.findIndex((x) => x.productId === pid);
    if (idx >= 0) {
      const copy = [...items];
      copy[idx] = {
        ...copy[idx],
        qty: Math.max(1, Math.floor(toNumber(copy[idx].qty))) + qty,
      };
      setItems(copy);
    } else {
      setItems([...items, { productId: pid, qty }]);
    }

    setNewProductId("");
    setNewQty("1");
  };

  const removeItem = (i) => {
    const copy = [...items];
    copy.splice(i, 1);
    setItems(copy);
  };

  const changeQty = (i, v) => {
    const copy = [...items];
    copy[i] = { ...copy[i], qty: Math.max(1, Math.floor(toNumber(v))) };
    setItems(copy);
  };

  // ===== Vehicles: manual single add (fallback) =====
  const addVehicleManual = () => {
    const key = makeVehicleKey({
      year: vYear,
      make: vMake,
      model: vModel,
      trim: vTrim,
    });

    if (!key) {
      alert("Vehicle requires at least Year, Make, Model.");
      return;
    }
    if (vehicleKeys.includes(key)) return;

    setVehicleKeys([...vehicleKeys, key]);

    setVYear("");
    setVMake("");
    setVModel("");
    setVTrim("");
  };

  const removeVehicle = (key) => {
    setVehicleKeys(vehicleKeys.filter((k) => k !== key));
  };

  // ===== Vehicles: bulk add (ALL COMBINATIONS) =====
  const addVehiclesFromSelections = () => {
    const years = yearSel.map((y) => Number(y)).filter((n) => Number.isFinite(n));
    const makes = makeSel.map((m) => String(m).trim()).filter(Boolean);
    const models = modelSel.map((m) => String(m).trim()).filter(Boolean);

    if (!years.length) {
      alert("Pick at least one year.");
      return;
    }
    if (!makes.length) {
      alert("Pick at least one make.");
      return;
    }
    if (!models.length) {
      alert("Pick at least one model.");
      return;
    }

    const newKeys = [];
    for (const y of years) {
      for (const mk of makes) {
        for (const md of models) {
          const key = makeVehicleKey({ year: y, make: mk, model: md, trim: "" });
          if (key) newKeys.push(key);
        }
      }
    }

    setVehicleKeys((prev) => uniq([...(prev || []), ...newKeys]));
  };

  // ===== Save =====
  const onSave = async () => {
    if (!tenantId || !shopId || !bundlesRef) return;

    const cleanName = String(name || "").trim();
    if (!cleanName) {
      alert("Bundle name is required.");
      return;
    }

    const price = toNumber(bundlePrice);
    if (price < 0) {
      alert("Bundle price cannot be negative.");
      return;
    }

    const cleanVehicleKeys = (vehicleKeys || [])
      .map((k) => String(k || "").trim())
      .filter(Boolean);

    setSaving(true);
    try {
      const payload = {
        tenantId,
        shopId,
        name: cleanName,
        sku: String(sku || "").trim() || null,
        bundlePrice: price,
        active: Boolean(active),
        pricingMode: "bundlePrice",
        items: Array.isArray(items) ? items : [],
        vehicleKeys: cleanVehicleKeys,
        updatedAt: serverTimestamp(),
      };

      if (isNew) {
        payload.createdAt = serverTimestamp();
        const created = await addDoc(bundlesRef, payload);
        navigate(`/manager/bundles/${created.id}`);
      } else {
        const ref = doc(db, "shops", shopId, "bundles", bundleId);
        await updateDoc(ref, payload);
        alert("Saved.");
      }
    } catch (e) {
      console.error("[ManagerBundleEditor] save error:", e);
      alert("Failed to save bundle.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="inventory-container">
        <div style={{ padding: 12, opacity: 0.7 }}>Loading…</div>
      </div>
    );
  }

  return (
    <div className="inventory-container">
      <div className="search-row" style={{ display: "flex", gap: 8 }}>
        <button
          className="search-box"
          onClick={() => navigate("/manager/bundles")}
          style={{ width: 120 }}
        >
          ← Back
        </button>

        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>
            {isNew ? "New Bundle" : "Edit Bundle"}
          </div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Bundle pricing + included items + vehicle targeting
          </div>
        </div>

        <button
          className="search-box"
          onClick={onSave}
          disabled={saving}
          style={{ width: 140, opacity: saving ? 0.7 : 1 }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
        {/* DETAILS */}
        <div
          style={{
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 12,
            padding: 12,
            background: "white",
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Details</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Bundle Name</div>
              <input
                className="search-box"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Remote Start + Install"
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Bundle Price</div>
              <input
                className="search-box"
                value={bundlePrice}
                onChange={(e) => setBundlePrice(e.target.value)}
                placeholder="0"
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>SKU (optional)</div>
              <input
                className="search-box"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="BUNDLE-001"
                style={{ width: "100%" }}
              />
            </div>

            <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                />
                Active
              </label>
            </div>
          </div>
        </div>

        {/* ITEMS */}
        <div
          style={{
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 12,
            padding: 12,
            background: "white",
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Bundle Items</div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              className="search-box"
              value={newProductId}
              onChange={(e) => setNewProductId(e.target.value)}
              placeholder="Product ID (from Inventory)"
              style={{ width: 320 }}
            />
            <input
              className="search-box"
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
              placeholder="Qty"
              style={{ width: 120 }}
            />
            <button className="search-box" onClick={addItem} style={{ width: 120 }}>
              + Add
            </button>
          </div>

          {items.length === 0 ? (
            <div style={{ marginTop: 10, fontSize: 13, opacity: 0.7 }}>
              No items yet. Add products by Product ID.
            </div>
          ) : (
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {items.map((it, idx) => (
                <div
                  key={`${it.productId}-${idx}`}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    justifyContent: "space-between",
                    border: "1px solid rgba(0,0,0,0.06)",
                    borderRadius: 10,
                    padding: 10,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 13 }}>
                      Product ID: {it.productId}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      className="search-box"
                      value={String(it.qty ?? 1)}
                      onChange={(e) => changeQty(idx, e.target.value)}
                      style={{ width: 90 }}
                    />
                    <button
                      className="search-box"
                      onClick={() => removeItem(idx)}
                      style={{ width: 110, opacity: 0.85 }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* VEHICLES (FIXED UI: click-to-toggle + chips, no giant listboxes, no select-all/clear-all) */}
        <div
          style={{
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 12,
            padding: 12,
            background: "white",
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Applies To Vehicles</div>

          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 10 }}>
            Click to add. Click again (chip ✕) to remove. Add as many as you want.
          </div>

          {/* Pickers */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {/* YEAR */}
            <div>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
                Year (click-to-toggle)
              </div>

              <select
                value={yearPick}
                onChange={(e) => onPickYear(e.target.value)}
                className="search-box"
                style={{ width: "100%" }}
              >
                <option value="">Select year…</option>
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>

              {yearSel.length > 0 && (
                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {yearSel.map((y) => (
                    <Chip
                      key={y}
                      label={String(y)}
                      onClick={() => setYearSel((prev) => prev.filter((n) => n !== y))}
                    />
                  ))}
                </div>
              )}

              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 6 }}>
                  Or add a range
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input
                    className="search-box"
                    value={yearFrom}
                    onChange={(e) => setYearFrom(e.target.value)}
                    placeholder="From"
                    style={{ width: 110 }}
                  />
                  <input
                    className="search-box"
                    value={yearTo}
                    onChange={(e) => setYearTo(e.target.value)}
                    placeholder="To"
                    style={{ width: 110 }}
                  />
                  <button className="search-box" onClick={applyYearRange} style={{ width: 140 }}>
                    Apply Range
                  </button>
                </div>
              </div>
            </div>

            {/* MAKE */}
            <div>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
                Make (click-to-toggle)
              </div>

              <select
                value={makePick}
                onChange={(e) => onPickMake(e.target.value)}
                className="search-box"
                style={{ width: "100%" }}
                disabled={!yearSel.length}
              >
                <option value="">
                  {yearSel.length ? "Select make…" : "Pick year(s) first…"}
                </option>
                {makeOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>

              {makeSel.length > 0 && (
                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {makeSel.map((m) => (
                    <Chip
                      key={m}
                      label={m}
                      onClick={() => setMakeSel((prev) => prev.filter((x) => x !== m))}
                    />
                  ))}
                </div>
              )}

              <div style={{ fontSize: 12, opacity: 0.6, marginTop: 10 }}>
                (Makes load from your fitment data for the selected years.)
              </div>
            </div>

            {/* MODEL */}
            <div>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
                Model (click-to-toggle)
              </div>

              <select
                value={modelPick}
                onChange={(e) => onPickModel(e.target.value)}
                className="search-box"
                style={{ width: "100%" }}
                disabled={!yearSel.length || !makeSel.length}
              >
                <option value="">
                  {yearSel.length && makeSel.length
                    ? "Select model…"
                    : "Pick year(s) + make(s) first…"}
                </option>
                {modelOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>

              {modelSel.length > 0 && (
                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {modelSel.map((m) => (
                    <Chip
                      key={m}
                      label={m}
                      onClick={() => setModelSel((prev) => prev.filter((x) => x !== m))}
                    />
                  ))}
                </div>
              )}

              <div style={{ fontSize: 12, opacity: 0.6, marginTop: 10 }}>
                (Models load from your fitment data for selected years + makes.)
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className="search-box"
              onClick={addVehiclesFromSelections}
              style={{ width: 260 }}
            >
              + Add All Combinations
            </button>
            <button className="search-box" onClick={clearSelections} style={{ width: 200 }}>
              Clear Selections
            </button>
          </div>

          {/* Manual add fallback */}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 6, opacity: 0.9 }}>
              Manual Add (fallback)
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                className="search-box"
                value={vYear}
                onChange={(e) => setVYear(e.target.value)}
                placeholder="Year"
                style={{ width: 140 }}
              />
              <input
                className="search-box"
                value={vMake}
                onChange={(e) => setVMake(e.target.value)}
                placeholder="Make"
                style={{ width: 180 }}
              />
              <input
                className="search-box"
                value={vModel}
                onChange={(e) => setVModel(e.target.value)}
                placeholder="Model"
                style={{ width: 200 }}
              />
              <input
                className="search-box"
                value={vTrim}
                onChange={(e) => setVTrim(e.target.value)}
                placeholder="Trim (optional)"
                style={{ width: 220 }}
              />
              <button className="search-box" onClick={addVehicleManual} style={{ width: 120 }}>
                + Add
              </button>
            </div>
          </div>

          {/* Stored keys list */}
          {vehicleKeys.length === 0 ? (
            <div style={{ marginTop: 12, fontSize: 13, opacity: 0.7 }}>
              No vehicles assigned yet.
            </div>
          ) : (
            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              {vehicleKeys.map((k) => (
                <div
                  key={k}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    justifyContent: "space-between",
                    border: "1px solid rgba(0,0,0,0.06)",
                    borderRadius: 10,
                    padding: 10,
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: 13, opacity: 0.9 }}>{k}</div>
                  <button
                    className="search-box"
                    onClick={() => removeVehicle(k)}
                    style={{ width: 110, opacity: 0.85 }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}







