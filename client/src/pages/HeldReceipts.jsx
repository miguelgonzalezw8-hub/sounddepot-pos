import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  onSnapshot,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "../firebase";

export default function HeldReceipts() {
  const [receipts, setReceipts] = useState([]);
  const navigate = useNavigate();

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

  const resumeReceipt = async (receipt) => {
    sessionStorage.setItem("resumeReceipt", JSON.stringify(receipt));
    await deleteDoc(doc(db, "heldReceipts", receipt.id));
    navigate("/sell");
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Held Receipts</h1>

      {receipts.length === 0 && (
        <p className="text-gray-500">No held receipts</p>
      )}

      <div className="space-y-3">
        {receipts.map((r) => (
          <div
            key={r.id}
            className="border rounded-lg p-4 flex justify-between items-center"
          >
            <div>
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
            </div>

            <button
              onClick={() => resumeReceipt(r)}
              className="bg-blue-600 text-white px-4 py-2 rounded"
            >
              Resume
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
