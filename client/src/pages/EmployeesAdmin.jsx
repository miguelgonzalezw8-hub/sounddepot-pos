import { useState } from "react";
import { createPosAccount } from "../services/authService";

export default function EmployeesAdmin({
  terminal,
  currentPosAccount,
  devMode,
  isManager,
}) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);

  const isOwnerTerminal = terminal?.mode === "owner";
  const canEdit = devMode || isOwnerTerminal || isManager;

  const handleAddEmployee = async () => {
    if (!canEdit || !terminal?.tenantId || !terminal?.shopId) return;

    try {
      setSaving(true);
      console.info("[EmployeesAdmin] createPosAccount attempt", {
        tenantId: terminal.tenantId,
        shopId: terminal.shopId,
        terminalMode: terminal.mode,
        currentPosAccountRole: currentPosAccount?.role || null,
      });

      await createPosAccount({
        tenantId: terminal.tenantId,
        shopId: terminal.shopId,
        name,
        pin,
        role: "employee",
      });
    } catch (error) {
      console.error("[EmployeesAdmin] createPosAccount failed", {
        code: error?.code || "unknown",
        message: error?.message || "Unknown error",
      });
      throw error;
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
      <input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" />
      <button onClick={handleAddEmployee} disabled={saving || !canEdit}>
        Add
      </button>
    </div>
  );
}
