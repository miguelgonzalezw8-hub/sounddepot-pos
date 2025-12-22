import { Link } from "react-router-dom";

export default function Settings({ darkMode, setDarkMode }) {
  return (
    <div className="p-6 space-y-6 max-w-xl">

      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
        Settings
      </h1>

      {/* ======================
          APPEARANCE / DARK MODE
      ====================== */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 space-y-3">

        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          Appearance
        </h2>

        <p className="text-sm text-slate-500 dark:text-slate-400">
          Toggle dark mode for the entire POS system.
        </p>

        <button
          onClick={() => setDarkMode(!darkMode)}
          className="flex items-center gap-3 px-4 py-2 rounded-full border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-100 transition"
        >
          {/* Toggle pill */}
          <span
            className={`inline-flex h-5 w-10 items-center rounded-full transition ${
              darkMode ? "bg-blue-600" : "bg-slate-400"
            }`}
          >
            <span
              className={`h-4 w-4 rounded-full bg-white shadow transform transition-transform ${
                darkMode ? "translate-x-5" : "translate-x-1"
              }`}
            />
          </span>

          <span className="text-sm font-medium">
            {darkMode ? "Dark Mode ON 🌙" : "Dark Mode OFF ☀️"}
          </span>
        </button>
      </div>

      {/* ======================
          SYSTEM SETTINGS
      ====================== */}
      <div className="space-y-3">

        {/* ✅ KEEP RECEIPT EDITOR */}
        <Link
          to="/settings/receipt"
          className="block p-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition"
        >
          🧾 Receipt Editor
        </Link>

        {/* ✅ NEW: INSTALLERS */}
        <Link
          to="/settings/installers"
          className="block p-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold transition"
        >
          👨‍🔧 Installers
        </Link>

      </div>
    </div>
  );
}
