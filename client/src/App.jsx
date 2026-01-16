// src/App.jsx
import { useState, useEffect } from "react";
import { Routes, Route, NavLink, useLocation, useNavigate } from "react-router-dom";
import { onAuthStateChanged, getIdTokenResult } from "firebase/auth";
import { auth } from "./firebase";

import Login from "./components/Login";

/* ================= PAGES ================= */
import HeldReceipts from "./pages/HeldReceipts";
import Sell from "./pages/Sell";
import Inventory from "./pages/Inventory";
import InventoryProductDetail from "./pages/InventoryProductDetail";
import InventoryUnitDetail from "./pages/InventoryUnitDetail";
import ProductCheckIn from "./pages/ProductCheckIn";
import Settings from "./pages/Settings";
import ReceiptEditor from "./pages/ReceiptEditor";
import ReceiptPrint from "./pages/ReceiptPrint";
import Installers from "./pages/Installers";
import ManagerSecurity from "./pages/ManagerSecurity";
import ManagerMenu from "./pages/ManagerMenu";

/* ================= REPORTS ================= */
import ReportsMenu from "./pages/reports/ReportsMenu";
import ReportSalesSummary from "./pages/reports/ReportSalesSummary";
import ReportDailyCloseout from "./pages/reports/ReportDailyCloseout";
import ReportInventoryValuation from "./pages/reports/ReportInventoryValuation";
import ReportCOGSSummary from "./pages/reports/ReportCOGSSummary";
import ReportBackorders from "./pages/reports/ReportBackorders";
import ReportInventoryAging from "./pages/reports/ReportInventoryAging";

/* ================= DASHBOARD ================= */
function Dashboard() {
  const navigate = useNavigate();

  // ✅ Dashboard-only tile grid (self-contained)
  const tilesGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 20,
    marginTop: 20,
  };

  return (
    <div className="inventory-container">
      <div className="search-row">
        <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">
          Dashboard
        </div>
      </div>

      {/* ✅ Neatly stacked dashboard tiles */}
      <div style={tilesGridStyle}>
        <div className="tile" onClick={() => navigate("/reports")}>
          <span className="tile-title">📊 Reports</span>
          <span className="tile-sub">Sales, Inventory, Accounting</span>
        </div>

        <div className="tile" onClick={() => navigate("/manager")}>
          <span className="tile-title">🛡️ Manager</span>
          <span className="tile-sub">PIN + manager tools</span>
        </div>
      </div>
    </div>
  );
}

/* ================= NAV ================= */
const navItems = [
  { label: "Dashboard", to: "/" },
  { label: "Sell", to: "/sell" },
  { label: "Inventory", to: "/inventory" },
  { label: "Settings", to: "/settings" },
];

export default function App() {
  const location = useLocation();
  const hideLayout = location.pathname === "/print-receipt";

  /* ================= AUTH STATE ================= */
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setUser(null);
        setAuthReady(true);
        return;
      }

      // ✅ pull custom claims (role)
      const token = await getIdTokenResult(currentUser);

      setUser({
        uid: currentUser.uid,
        email: currentUser.email,
        role: token.claims.role || "user",
      });

      setAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  /* ================= DARK MODE ================= */
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem("theme") === "dark";
  });

  useEffect(() => {
    const html = document.documentElement;

    if (darkMode) {
      html.classList.add("dark");
      html.setAttribute("data-theme", "dark");
    } else {
      html.classList.remove("dark");
      html.setAttribute("data-theme", "light");
    }

    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  /* ================= LOADING / AUTH ================= */
  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200">
        Loading...
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  // (You can use this later for route guarding, but leaving it here doesn’t hurt)
  const isManager = user.role === "owner" || user.role === "manager";

  /* ================= APP ================= */
  return (
    <div className="min-h-screen flex bg-slate-100 dark:bg-slate-950">
      {/* ========== SIDEBAR ========== */}
      {!hideLayout && (
        <aside className="w-60 bg-slate-900 text-slate-100 flex flex-col">
          <div className="px-4 py-5 border-b border-slate-800">
            <div className="text-lg font-semibold tracking-tight">
              Sound Depot POS
            </div>
            <div className="text-xs text-slate-400">
              Car Audio · Fitment · Sales
            </div>
          </div>

          <nav className="flex-1 px-2 py-4 space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  [
                    "flex items-center px-3 py-2 text-sm rounded-md transition-colors",
                    isActive
                      ? "bg-slate-800 text-white"
                      : "text-slate-300 hover:bg-slate-800/60 hover:text-white",
                  ].join(" ")
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>
      )}

      {/* ========== MAIN ========== */}
      <div className="flex-1 flex flex-col">
        {/* HEADER */}
        {!hideLayout && (
          <header className="h-14 flex items-center px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {location.pathname === "/sell"
                ? "Sell"
                : location.pathname === "/inventory"
                ? "Inventory"
                : location.pathname.startsWith("/settings")
                ? "Settings"
                : location.pathname.startsWith("/reports")
                ? "Reports"
                : "Dashboard"}
            </span>
          </header>
        )}

        {/* CONTENT */}
        <main className={`flex-1 ${hideLayout ? "" : "p-6"}`}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/sell" element={<Sell />} />

            <Route path="/inventory" element={<Inventory />} />
            <Route
              path="/inventory/product/:productId"
              element={<InventoryProductDetail />}
            />
            <Route path="/inventory/unit/:unitId" element={<InventoryUnitDetail />} />
            <Route path="/inventory/check-in" element={<ProductCheckIn />} />

            <Route path="/held-receipts" element={<HeldReceipts />} />

            {/* REPORTS */}
            <Route path="/reports" element={<ReportsMenu />} />
            <Route path="/reports/sales-summary" element={<ReportSalesSummary />} />
            <Route path="/reports/daily-closeout" element={<ReportDailyCloseout />} />
            <Route
              path="/reports/inventory-valuation"
              element={<ReportInventoryValuation />}
            />
            <Route path="/reports/cogs" element={<ReportCOGSSummary />} />
            <Route path="/reports/backorders" element={<ReportBackorders />} />
            <Route path="/reports/inventory-aging" element={<ReportInventoryAging />} />

            {/* MANAGER */}
            <Route path="/manager" element={<ManagerMenu />} />
            <Route path="/manager/security" element={<ManagerSecurity />} />

            {/* SETTINGS */}
            <Route
              path="/settings"
              element={
                <Settings user={user} darkMode={darkMode} setDarkMode={setDarkMode} />
              }
            />
            <Route path="/settings/receipt" element={<ReceiptEditor />} />
            <Route path="/settings/installers" element={<Installers user={user} />} />

            {/* PRINT */}
            <Route path="/print-receipt" element={<ReceiptPrint />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
