// client/src/pages/Installers.jsx
import { useEffect, useMemo, useState } from "react";
import { collection, addDoc, onSnapshot, serverTimestamp, query, where } from "firebase/firestore";
import { db } from "../firebase";

/* ================= DEFAULT DATA ================= */

const INSTALLER_TYPES = [
  "Basic",
  "Custom",
  "Remote Start / Alarm",
  "Tint",
  "Lighting",
  "Mechanical",
  "Marine",
];

const DEFAULT_CERTIFICATIONS = [
  "MECP Basic",
  "MECP Advanced",
  "MECP Master",
  "Compustar Pro",
  "Directed SmartStart",
  "iDatalink Maestro",
  "Llumar Certified",
  "3M Authorized Installer",
  "XPEL Certified",
  "JL Audio Marine Certified",
  "Fusion Marine Certified",
  "ADAS Calibration",
  "OEM Integration Specialist",
];

/* ================= COMPONENT ================= */

export default function Installers({ user }) {
  const tenantId = user?.tenantId || "";

  if (!user || (user.role !== "owner" && user.role !== "manager")) {
    return (
      <div className="p-6 text-red-600 font-semibold">
        No access to installer settings.
      </div>
    );
  }

  /* ================= STATE ================= */

  const [installers, setInstallers] = useState([]);

  const [name, setName] = useState("");
  const [types, setTypes] = useState([]);
  const [payType, setPayType] = useState("hourly");
  const [hourlyRate, setHourlyRate] = useState("");
  const [commissionRate, setCommissionRate] = useState("");
  const [rentDue, setRentDue] = useState("");

  const [certEnabled, setCertEnabled] = useState(false);
  const [installerCerts, setInstallerCerts] = useState([]);
  const [allCerts, setAllCerts] = useState(DEFAULT_CERTIFICATIONS);
  const [selectedCert, setSelectedCert] = useState("");
  const [newCert, setNewCert] = useState("");

  const canUse = useMemo(() => !!tenantId, [tenantId]);

  /* ================= LOAD INSTALLERS (TENANT SCOPED) ================= */

  useEffect(() => {
    if (!canUse) return;
    const qy = query(collection(db, "installers"), where("tenantId", "==", tenantId));
    const unsub = onSnapshot(
      qy,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        rows.sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || "")));
        setInstallers(rows);
      },
      (err) => {
        console.error("[Installers] permission/index error:", err);
        setInstallers([]);
      }
    );
    return () => unsub();
  }, [canUse, tenantId]);

  /* ================= SAVE INSTALLER ================= */

  const saveInstaller = async () => {
    if (!canUse) return alert("No tenant selected.");
    if (!name) return alert("Installer name required");

    await addDoc(collection(db, "installers"), {
      tenantId, // ✅ REQUIRED
      name,
      types,
      pay: {
        type: payType,
        hourlyRate: payType === "hourly" ? Number(hourlyRate) : null,
        commissionRate: payType === "commission" ? Number(commissionRate) : null,
        rentDue: payType === "commission" ? Number(rentDue) : null,
      },
      certifications: certEnabled ? installerCerts : [],
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // reset
    setName("");
    setTypes([]);
    setPayType("hourly");
    setHourlyRate("");
    setCommissionRate("");
    setRentDue("");
    setInstallerCerts([]);
    setCertEnabled(false);
    setSelectedCert("");
    setNewCert("");
  };

  /* ================= UI ================= */

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold">🛠 Installer Management</h1>

      {!canUse && (
        <div className="p-3 rounded border bg-yellow-50 text-yellow-900">
          Terminal/tenant not resolved yet. Configure terminal first.
        </div>
      )}

      {/* ================= ADD INSTALLER ================= */}
      <div className="bg-white border rounded-lg p-4 space-y-4">
        <h2 className="font-semibold text-lg">Add Installer</h2>

        <input
          placeholder="Installer Name"
          className="w-full border px-3 py-2 rounded"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        {/* INSTALLER TYPES */}
        <div>
          <label className="text-sm font-medium">Installer Type(s)</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {INSTALLER_TYPES.map((t) => (
              <button
                key={t}
                onClick={() =>
                  setTypes((prev) =>
                    prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
                  )
                }
                className={`px-3 py-1 rounded border text-sm ${
                  types.includes(t) ? "bg-blue-600 text-white" : "bg-white"
                }`}
                type="button"
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* PAY STRUCTURE */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Pay Structure</label>

          <select
            value={payType}
            onChange={(e) => setPayType(e.target.value)}
            className="border px-3 py-2 rounded w-full"
          >
            <option value="hourly">Hourly</option>
            <option value="commission">Commission</option>
          </select>

          {payType === "hourly" && (
            <input
              type="number"
              placeholder="Hourly Rate"
              className="border px-3 py-2 rounded w-full"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
            />
          )}

          {payType === "commission" && (
            <>
              <input
                type="number"
                placeholder="Commission %"
                className="border px-3 py-2 rounded w-full"
                value={commissionRate}
                onChange={(e) => setCommissionRate(e.target.value)}
              />
              <input
                type="number"
                placeholder="Weekly / Monthly Rent Due"
                className="border px-3 py-2 rounded w-full"
                value={rentDue}
                onChange={(e) => setRentDue(e.target.value)}
              />
            </>
          )}
        </div>

        {/* CERTIFICATIONS */}
        <div className="space-y-2">
          <label className="flex gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={certEnabled}
              onChange={() => setCertEnabled(!certEnabled)}
            />
            Certifications
          </label>

          {certEnabled && (
            <>
              <div className="flex gap-2">
                <select
                  value={selectedCert}
                  onChange={(e) => setSelectedCert(e.target.value)}
                  className="border px-3 py-2 rounded w-full"
                >
                  <option value="">Select certification</option>
                  {allCerts.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => {
                    if (selectedCert && !installerCerts.includes(selectedCert)) {
                      setInstallerCerts([...installerCerts, selectedCert]);
                    }
                  }}
                  className="border px-3 rounded"
                >
                  Add
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  placeholder="Add new certification"
                  className="border px-3 py-2 rounded w-full"
                  value={newCert}
                  onChange={(e) => setNewCert(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newCert && !allCerts.includes(newCert)) {
                      setAllCerts([...allCerts, newCert]);
                      setNewCert("");
                    }
                  }}
                  className="border px-3 rounded"
                >
                  +
                </button>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                {installerCerts.map((c) => (
                  <span key={c} className="px-2 py-1 bg-blue-100 text-blue-700 rounded">
                    {c}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        <button
          onClick={saveInstaller}
          className="bg-green-600 text-white px-4 py-2 rounded font-semibold"
          disabled={!canUse}
          type="button"
        >
          ✅ Save Installer
        </button>
      </div>

      {/* ================= LIST ================= */}
      <div className="bg-white border rounded-lg p-4">
        <h2 className="font-semibold mb-3">Installers ({installers.length})</h2>

        <div className="space-y-2 text-sm">
          {installers.map((i) => (
            <div key={i.id} className="border p-3 rounded">
              <div className="font-semibold">{i.name}</div>
              <div>Types: {i.types?.join(", ")}</div>
              <div>Pay: {i.pay?.type}</div>
              {i.certifications?.length > 0 && (
                <div>Certs: {i.certifications.join(", ")}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
