export function toISODateInput(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function startOfDay(dateStr) {
  // dateStr like "2026-01-16"
  const d = new Date(`${dateStr}T00:00:00`);
  return d;
}

export function endOfDay(dateStr) {
  const d = new Date(`${dateStr}T23:59:59.999`);
  return d;
}

export function money(n) {
  const x = Number(n || 0);
  return `$${x.toFixed(2)}`;
}

export function downloadCSV(filename, rows) {
  const escape = (v) => {
    const s = String(v ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const csv = rows.map((r) => r.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}







