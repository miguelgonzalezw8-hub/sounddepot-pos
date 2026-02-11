// src/App.jsx
import { useState, useEffect } from "react";
import {
  Routes,
  Route,
  NavLink,
  useLocation,
} from "react-router-dom";
import {
  onAuthStateChanged,
  getIdTokenResult,
} from "firebase/auth";

import { auth } from "./firebase";
import HeldReceipts from "./pages/HeldReceipts";
/* ================= PAGES ================= */
import Sell from "./pages/Sell";
import Inventory from "./pages/Inventory";
import ProductCheckIn from "./pages/ProductCheckIn";
import Settings from "./pages/Settings";
import ReceiptEditor from "./pages/ReceiptEditor";
import ReceiptPrint from "./pages/ReceiptPrint";
import Installers from "./pages/Installers";
import Login from "./components/Login";

const ROLE_PERMISSIONS = {
  dev: {
    dashboard: true,
    sell: true,
    inventory: true,
    backOrders: true,
    settings: true,
    receiptEditor: true,
    installers: true,
    devMenu: true,
  },
  developer: {
    dashboard: true,
    sell: true,
    inventory: true,
    backOrders: true,
    settings: true,
    receiptEditor: true,
    installers: true,
    devMenu: true,
    createManagerAccounts: true,
  },
  owner: {
    dashboard: true,
    sell: true,
    inventory: true,
    backOrders: true,
    settings: true,
    receiptEditor: true,
    installers: true,
    devMenu: false,
    createManagerAccounts: true,
  },
  tenant: {
    dashboard: true,
    sell: true,
    inventory: true,
    backOrders: true,
    settings: true,
    receiptEditor: true,
    installers: true,
    devMenu: false,
    createManagerAccounts: true,
  },
  tenant_owner: {
    dashboard: true,
    sell: true,
    inventory: true,
    backOrders: true,
    settings: true,
    receiptEditor: true,
    installers: true,
    devMenu: false,
    createManagerAccounts: true,
  },
  main_owner: {
    dashboard: true,
    sell: true,
    inventory: true,
    backOrders: true,
    settings: true,
    receiptEditor: true,
    installers: true,
    devMenu: false,
    createManagerAccounts: true,
  },
  manager: {
    dashboard: true,
    sell: true,
    inventory: true,
    backOrders: true,
    settings: true,
    receiptEditor: true,
    installers: true,
    devMenu: false,
    createManagerAccounts: false,
  },
  employee: {
    dashboard: true,
    sell: true,
    inventory: true,
    backOrders: true,
    settings: false,
    receiptEditor: false,
    installers: false,
    devMenu: false,
    createManagerAccounts: false,
  },
  installer: {
    dashboard: true,
    sell: true,
    inventory: true,
    backOrders: true,
    settings: false,
    receiptEditor: false,
    installers: false,
    devMenu: false,
    createManagerAccounts: false,
  },
  user: {
    dashboard: false,
    sell: false,
    inventory: false,
    backOrders: false,
    settings: false,
    receiptEditor: false,
    installers: false,
    devMenu: false,
    createManagerAccounts: false,
  },
};

const getPermissionsForRole = (role) => ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.user;

/* ================= DASHBOARD ================= */
function Dashboard() {
  return (
    <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">
      Dashboard
    </div>
  );
}

/* ================= NAV ================= */
const navItems = [
  { label: "Dashboard", to: "/", permission: "dashboard" },
  { label: "Sell", to: "/sell", permission: "sell" },
  { label: "Inventory", to: "/inventory", permission: "inventory" },
  { label: "Back Orders", to: "/held-receipts", permission: "backOrders" },
  { label: "Settings", to: "/settings", permission: "settings" },
  { label: "Dev Menu", to: "/settings/dev", permission: "devMenu" },
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

      const role = token.claims.role || "user";

      setUser({
        uid: currentUser.uid,
        email: currentUser.email,
        role,
        permissions: getPermissionsForRole(role),
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

  const canAccess = (permissionKey) => Boolean(user?.permissions?.[permissionKey]);

  const unauthorizedPage = (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
      You do not have permission to view this page.
    </div>
  );

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
            {navItems.filter((item) => canAccess(item.permission)).map((item) => (
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
                : "Dashboard"}
            </span>
          </header>
        )}

        {/* CONTENT */}
        <main className={`flex-1 ${hideLayout ? "" : "p-6"}`}>
          <Routes>
            <Route path="/" element={canAccess("dashboard") ? <Dashboard /> : unauthorizedPage} />
            <Route path="/sell" element={canAccess("sell") ? <Sell /> : unauthorizedPage} />
            <Route path="/inventory" element={canAccess("inventory") ? <Inventory /> : unauthorizedPage} />
            <Route path="/inventory/check-in" element={canAccess("inventory") ? <ProductCheckIn /> : unauthorizedPage} />
            <Route path="/held-receipts" element={canAccess("backOrders") ? <HeldReceipts /> : unauthorizedPage} />
            {/* SETTINGS */}
            <Route
              path="/settings"
              element={
                canAccess("settings") ? <Settings
                  user={user}
                  darkMode={darkMode}
                  setDarkMode={setDarkMode}
                  /> : unauthorizedPage
              }
            />

            <Route path="/settings/receipt" element={canAccess("receiptEditor") ? <ReceiptEditor /> : unauthorizedPage} />

            {/* ✅ ROLE-RESTRICTED PAGE */}
            <Route
               path="/settings/installers"
               element={canAccess("installers") ? <Installers user={user} canManageInstallers={canAccess("installers")} /> : unauthorizedPage}
              />

            <Route
              path="/settings/dev"
              element={
                canAccess("devMenu") ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    Dev menu placeholder.
                  </div>
                ) : (
                  unauthorizedPage
                )
              }
            />

            <Route path="*" element={canAccess("dashboard") ? <Dashboard /> : unauthorizedPage} />


            {/* PRINT */}
            <Route path="/print-receipt" element={<ReceiptPrint />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
