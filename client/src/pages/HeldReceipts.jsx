import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  onSnapshot,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "../firebase";
import ScheduleInstallModal from "../components/ScheduleInstallModal";

/* ===============================
   STATUS LABEL HELPER
================================ */
function statusLabel(status) {
  switch (status) {
    case "scheduled":
      return { text: "🗓️ Scheduled", className: "status scheduled" };
    case "in_progress":
      return { text: "🔧 In Progress", className: "status in-progress" };
    case "completed":
      return { text: "✅ Completed", className: "status completed" };
    default:
      return { text: "⏸ Held", className: "status held" };
  }
}

export default function HeldReceipts() {
  const [receipts, setReceipts] = useState([]);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState(null);

  const navigate = useNavigate();

  /* ===============================
     LOAD HELD RECEIPTS
  ================================ */
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "heldReceipts"), (snap) => {
      setReceipts(
        snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }))
      );
    });

    return unsub;
  }, []);

  /* ===============================
     RESUME RECEIPT (FIXED FOR REAL)
     READ-ONLY + NORMALIZED
  ================================ */
  const resumeReceipt = (r) => {
    sessionStorage.setItem(
      "resumeReceipt",
      JSON.stringify({
        cartItems: r.cartItems || [],
        customer: r.customer || null,
        vehicle: r.vehicle || null,       // ✅ VEHICLE PRESERVED
        installer: r.installer || null,
        installAt: r.installAt || null,
      })
    );

    navigate("/sell");
  };

  /* ===============================
     DELETE HELD RECEIPT (NEW)
  ================================ */
  const deleteReceipt = async (r) => {
    if (!window.confirm("Delete this held receipt?")) return;
    await deleteDoc(doc(db, "heldReceipts", r.id));
  };

  /* ===============================
     PRINT RECEIPT (UNCHANGED)
  ================================ */
  const printReceipt = (r) => {
    const printable = {
      ...r,
      items: r.cartItems || [],
      totals: {
        subtotal: r.subtotal,
        tax: r.tax,
        total: r.total,
      },
    };

    localStorage.setItem(
      "currentReceipt",
      JSON.stringify(printable)
    );

    window.open("/print-receipt", "_blank");
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Held Receipts</h1>

      {receipts.length === 0 && (
        <p className="text-gray-500">No held receipts</p>
      )}

      <div className="space-y-3">
        {receipts.map((r) => {
          const status = r.status || "held";
          const badge = statusLabel(status);
          const vehicle = r.vehicle || null;
          const installAt = r.installAt || null;

          return (
            <div
              key={r.id}
              className="border rounded-lg p-4 flex justify-between items-center"
            >
              {/* LEFT */}
              <div className="space-y-1">
                <div className="font-semibold">
                  {r.customer
                    ? `${r.customer.firstName} ${r.customer.lastName}`
                    : "No Customer"}
                </div>

                <div className="text-sm text-gray-500">
                  Items: {r.cartItems?.length || 0}
                </div>

                <div className="text-sm">
                  Total: ${Number(r.total || 0).toFixed(2)}
                </div>

                {vehicle ? (
                  <div className="text-xs text-gray-600">
                    🚗 {vehicle.year} {vehicle.make} {vehicle.model}
                  </div>
                ) : (
                  <div className="text-xs text-gray-400">
                    No vehicle assigned
                  </div>
                )}

                {installAt ? (
                <div className="text-xs text-gray-600">
                  📅{" "}
                  {typeof installAt === "string"
                    ? new Date(installAt).toLocaleString()
                    : new Date(installAt.seconds * 1000).toLocaleString()}
                </div>
              ) : (
                <div className="text-xs text-gray-400">
                  Not scheduled
                </div>
              )}

              </div>

              {/* RIGHT */}
              <div className="flex flex-col items-end gap-2">
                <span className={badge.className}>{badge.text}</span>

                <button
                  onClick={() => resumeReceipt(r)}
                  className="bg-blue-600 text-white px-4 py-2 rounded text-sm"
                >
                  Resume
                </button>

                <button
                  onClick={() => printReceipt(r)}
                  className="bg-gray-100 border px-4 py-1.5 rounded text-sm hover:bg-gray-200"
                >
                  🖨 Print
                </button>

                <button
                  onClick={() => deleteReceipt(r)}
                  className="bg-red-600 text-white px-4 py-1.5 rounded text-sm"
                >
                  🗑 Delete
                </button>

                {(status === "held" || status === "scheduled") && (
                  <button
                    className="text-xs px-2 py-1 border rounded hover:bg-gray-100"
                    onClick={() => {
                      setSelectedReceipt(r);
                      setShowScheduleModal(true);
                    }}
                  >
                    🗓️ Schedule Install
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <ScheduleInstallModal
        open={showScheduleModal}
        receipt={selectedReceipt}
        onClose={() => {
          setShowScheduleModal(false);
          setSelectedReceipt(null);
        }}
      />
    </div>
  );
}
