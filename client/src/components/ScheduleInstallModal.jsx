import { useState, useEffect } from "react";
import {
  doc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";

export default function ScheduleInstallModal({
  open,
  onClose,
  receipt,
}) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [status, setStatus] = useState("scheduled");
  const [saving, setSaving] = useState(false);

  /* ===============================
     PREFILL IF ALREADY SCHEDULED
  ================================ */
  useEffect(() => {
    if (!receipt?.installAt) return;

    const d = new Date(receipt.installAt.seconds * 1000);
    setDate(d.toISOString().slice(0, 10));
    setTime(d.toTimeString().slice(0, 5));
    setStatus(receipt.status || "scheduled");
  }, [receipt]);

  if (!open || !receipt) return null;

  /* ===============================
     SAVE SCHEDULE
  ================================ */
  const handleSave = async () => {
    if (!date || !time) {
      alert("Please select date and time");
      return;
    }

    setSaving(true);

    try {
      const [hour, minute] = time.split(":").map(Number);
      const installDate = new Date(date);
      installDate.setHours(hour, minute, 0, 0);

      await updateDoc(doc(db, "heldReceipts", receipt.id), {
        installAt: Timestamp.fromDate(installDate),
        status,
        updatedAt: serverTimestamp(),
      });

      onClose();
    } catch (err) {
      console.error(err);
      alert("Failed to schedule install");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">Schedule Install</h2>

        <div className="modal-grid">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />

          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="scheduled">🗓️ Scheduled</option>
            <option value="in_progress">🔧 In Progress</option>
            <option value="completed">✅ Completed</option>
          </select>
        </div>

        <div className="modal-actions">
          <button
            className="cancel-btn"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>

          <button
            className="save-btn"
            onClick={handleSave}
            disabled={saving}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}







