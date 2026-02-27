// src/App.jsx
import { useState, useEffect, useMemo } from "react";
import { Routes, Route, NavLink, useLocation, useNavigate } from "react-router-dom";
import { db } from "./firebase";
import ManagerBundles from "./pages/ManagerBundles";
import ManagerBundleEditor from "./pages/ManagerBundleEditor";
import ManagerCoupons from "./pages/ManagerCoupons";
import ManagerLabor from "./pages/ManagerLabor";
import { collection, query, where, orderBy, limit, onSnapshot, Timestamp,} from "firebase/firestore";
import logo from "./assets/logo.png";
import InventoryImport from "./pages/InventoryImport";

/* ================= SHOPMONKEY-STYLE TERMINAL GATE ================= */
import { SessionProvider, useSession } from "./session/SessionProvider";
import TerminalSetup from "./pages/TerminalSetup";
import LockScreen from "./pages/LockScreen";
import Login from "./components/Login";

/* ✅ LOGOUT (ADDED) */
import { logoutFirebase } from "./services/authService";

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
import BackorderCenter from "./pages/BackorderCenter";
import EmployeesAdmin from "./pages/EmployeesAdmin";
import InviteCreateAccount from "./pages/InviteCreateAccount";
import OwnerLogin from "./pages/OwnerLogin";

/* ✅ DEV PAGES */
import DevMenu from "./pages/DevMenu";
import ShopsAdmin from "./pages/ShopsAdmin";
import AccountsAdmin from "./pages/AccountsAdmin";
import AcceptInvite from "./pages/AcceptInvite";

/* ✅ CUSTOMERS */
import Customers from "./pages/Customers";
import CustomerDetail from "./pages/CustomerDetail";

/* ✅ MASTER SEARCH */
import MasterSearch from "./pages/MasterSearch";

/* ================= REPORTS ================= */
import ReportsMenu from "./pages/reports/ReportsMenu";
import ReportSalesSummary from "./pages/reports/ReportSalesSummary";
import ReportDailyCloseout from "./pages/reports/ReportDailyCloseout";
import ReportInventoryValuation from "./pages/reports/ReportInventoryValuation";
import ReportCOGSSummary from "./pages/reports/ReportCOGSSummary";
import ReportBackorders from "./pages/reports/ReportBackorders";
import ReportInventoryAging from "./pages/reports/ReportInventoryAging";

/* ================= DASHBOARD CHART HELPERS ================= */
function formatMoney(n) {
  const x = Number(n || 0);
  return x.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function startOfDayLocal(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonthLocal(d = new Date()) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfYearLocal(d = new Date()) {
  const x = new Date(d);
  x.setMonth(0, 1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d, days) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function toISODate(d) {
  const x = new Date(d);
  const yyyy = x.getFullYear();
  const mm = String(x.getMonth() + 1).padStart(2, "0");
  const dd = String(x.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function SimpleLineChart({ points = [], height = 140 }) {
  const w = 520;
  const h = height;
  const pad = 16;

  const ys = points.map((p) => Number(p.y || 0));
  const maxY = Math.max(1, ...ys);
  const minY = 0;

  const plotW = w - pad * 2;
  const plotH = h - pad * 2;

  const xStep = points.length > 1 ? plotW / (points.length - 1) : plotW;

  const coords = points.map((p, i) => {
    const x = pad + i * xStep;
    const yVal = Number(p.y || 0);
    const t = (yVal - minY) / (maxY - minY || 1);
    const y = pad + (1 - t) * plotH;
    return { x, y };
  });

  const d =
    coords.length === 0
      ? ""
      : coords
          .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`)
          .join(" ");

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="currentColor" opacity="0.15" />
        <line x1={pad} y1={pad} x2={pad} y2={h - pad} stroke="currentColor" opacity="0.15" />
        <path d={d} fill="none" stroke="currentColor" strokeWidth="2" opacity="0.9" />
        {coords.map((c, idx) => (
          <circle key={idx} cx={c.x} cy={c.y} r="3" fill="currentColor" opacity="0.85" />
        ))}
      </svg>
    </div>
  );
}

function SimpleBarList({ rows = [] }) {
  const max = Math.max(1, ...rows.map((r) => Number(r.value || 0)));

  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const pct = (Number(r.value || 0) / max) * 100;
        return (
          <div key={r.label} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-slate-700 dark:text-white/80">{r.label}</span>
              <span className="text-slate-600 dark:text-white/70">{formatMoney(r.value)}</span>
            </div>
            <div className="h-2 rounded bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div className="h-2 bg-brand-primary dark:bg-slate-100" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ================= DASHBOARD ================= */
function Dashboard() {
  const navigate = useNavigate();
  const { terminal, booting, userProfile } = useSession();

  // ✅ tenantId comes from terminal (shared terminals) OR owner profile (owner logins)
  const tenantId = terminal?.tenantId || userProfile?.tenantId || null;

  const [ordersToday, setOrdersToday] = useState([]);
  const [ordersMTD, setOrdersMTD] = useState([]);
  const [ordersYTD, setOrdersYTD] = useState([]);
  const [ordersLast30, setOrdersLast30] = useState([]);
  const [installers, setInstallers] = useState([]);

  // ✅ Tenant-scoped installers
  useEffect(() => {
    if (booting) return;
    if (!tenantId) return;

    const unsub = onSnapshot(
      query(collection(db, "installers"), where("tenantId", "==", tenantId)),
      (snap) => setInstallers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("[Dashboard installers] permission/index error:", err)
    );

    return () => unsub();
  }, [booting, tenantId]);

  // ✅ Tenant-scoped orders (all 4 queries must include tenantId)
  useEffect(() => {
    if (booting) return;
    if (!tenantId) return;

    const now = new Date();
    const d0 = Timestamp.fromDate(startOfDayLocal(now));
    const m0 = Timestamp.fromDate(startOfMonthLocal(now));
    const y0 = Timestamp.fromDate(startOfYearLocal(now));
    const last30 = Timestamp.fromDate(startOfDayLocal(addDays(now, -29)));

    const base = collection(db, "orders");

    const unsub1 = onSnapshot(
      query(
        base,
        where("tenantId", "==", tenantId),
        where("createdAt", ">=", d0),
        orderBy("createdAt", "desc"),
        limit(500)
      ),
      (snap) => setOrdersToday(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("[Dashboard ordersToday] permission/index error:", err)
    );

    const unsub2 = onSnapshot(
      query(
        base,
        where("tenantId", "==", tenantId),
        where("createdAt", ">=", m0),
        orderBy("createdAt", "desc"),
        limit(2000)
      ),
      (snap) => setOrdersMTD(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("[Dashboard ordersMTD] permission/index error:", err)
    );

    const unsub3 = onSnapshot(
      query(
        base,
        where("tenantId", "==", tenantId),
        where("createdAt", ">=", y0),
        orderBy("createdAt", "desc"),
        limit(8000)
      ),
      (snap) => setOrdersYTD(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("[Dashboard ordersYTD] permission/index error:", err)
    );

    const unsub4 = onSnapshot(
      query(
        base,
        where("tenantId", "==", tenantId),
        where("createdAt", ">=", last30),
        orderBy("createdAt", "asc"),
        limit(6000)
      ),
      (snap) => setOrdersLast30(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("[Dashboard ordersLast30] permission/index error:", err)
    );

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
    };
  }, [booting, tenantId]);

  const calcTotals = (rows) => {
    const totalSales = rows.reduce((s, o) => s + Number(o.total || 0), 0);
    const taxTotal = rows.reduce((s, o) => s + Number(o.tax || 0), 0);
    const count = rows.length;
    const avg = count ? totalSales / count : 0;
    return { totalSales, taxTotal, count, avg };
  };

  const dtd = useMemo(() => calcTotals(ordersToday), [ordersToday]);
  const mtd = useMemo(() => calcTotals(ordersMTD), [ordersMTD]);
  const ytd = useMemo(() => calcTotals(ordersYTD), [ordersYTD]);

  const salesOverTime30 = useMemo(() => {
    const map = new Map();
    for (const o of ordersLast30) {
      const t = o.createdAt?.toDate ? o.createdAt.toDate() : null;
      const key = t ? toISODate(t) : "unknown";
      map.set(key, (map.get(key) || 0) + Number(o.total || 0));
    }

    const start = startOfDayLocal(addDays(new Date(), -29));
    const pts = [];
    for (let i = 0; i < 30; i++) {
      const d = addDays(start, i);
      const key = toISODate(d);
      pts.push({ xLabel: key.slice(5), y: map.get(key) || 0 });
    }
    return pts;
  }, [ordersLast30]);

  const salesPerEmployeeMTD = useMemo(() => {
    const by = new Map();
    for (const o of ordersMTD) {
      const key = o.installerId || "UNASSIGNED";
      by.set(key, (by.get(key) || 0) + Number(o.total || 0));
    }

    const nameFor = (id) => {
      if (id === "UNASSIGNED") return "Unassigned";
      const found = installers.find((i) => i.id === id);
      return found?.name || "Unknown";
    };

    return [...by.entries()]
      .map(([id, value]) => ({ label: nameFor(id), value }))
      .sort((a, b) => Number(b.value) - Number(a.value))
      .slice(0, 8);
  }, [ordersMTD, installers]);

  return (
    <div className="inventory-container">
      <div className="search-row flex items-center justify-between">
        <div className="text-2xl font-bold text-app-text dark:text-app-text">Dashboard</div>

        <button
          onClick={() => navigate("/search")}
          className="px-4 py-2 rounded-lg bg-brand-primary text-white text-sm font-semibold
           hover:bg-brand-primary/90 transition-colors shadow-md shadow-brand-primary/20" >
          🔎 Master Search
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 20,
          marginTop: 20,
        }}
      >
        <div className="tile" onClick={() => navigate("/reports")}>
          <span className="tile-title">📊 Reports</span>
          <span className="tile-sub">Sales, Inventory, Accounting</span>
        </div>

        <div className="tile" onClick={() => navigate("/customers")}>
          <span className="tile-title">👥 Customers</span>
          <span className="tile-sub">Search, edit, purchase history</span>
        </div>

        <div className="tile" onClick={() => navigate("/backorders")}>
          <span className="tile-title">🔔 Backorders</span>
          <span className="tile-sub">Notification center</span>
        </div>

        <div className="tile" onClick={() => navigate("/manager")}>
          <span className="tile-title">🛡️ Manager</span>
          <span className="tile-sub">PIN + manager tools</span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="bg-app-panel dark:bg-app-panel dark:bg-[#0b1220] border rounded-xl shadow-sm p-4">
          <div className="text-sm font-bold text-slate-700 dark:text-white/80">Today (DTD)</div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-slate-500">Sales</div>
              <div className="text-xl font-bold">{formatMoney(dtd.totalSales)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Orders</div>
              <div className="text-xl font-bold">{dtd.count}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Tax</div>
              <div className="text-lg font-semibold">{formatMoney(dtd.taxTotal)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Avg Ticket</div>
              <div className="text-lg font-semibold">{formatMoney(dtd.avg)}</div>
            </div>
          </div>
        </div>

        <div className="bg-app-panel dark:bg-app-panel dark:bg-[#0b1220] border rounded-xl shadow-sm p-4">
          <div className="text-sm font-bold text-slate-700 dark:text-white/80">Month-to-date (MTD)</div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-slate-500">Sales</div>
              <div className="text-xl font-bold">{formatMoney(mtd.totalSales)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Orders</div>
              <div className="text-xl font-bold">{mtd.count}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Tax</div>
              <div className="text-lg font-semibold">{formatMoney(mtd.taxTotal)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Avg Ticket</div>
              <div className="text-lg font-semibold">{formatMoney(mtd.avg)}</div>
            </div>
          </div>
        </div>

        <div className="bg-app-panel dark:bg-app-panel dark:bg-[#0b1220] border rounded-xl shadow-sm p-4">
          <div className="text-sm font-bold text-slate-700 dark:text-white/80">Year-to-date (YTD)</div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-slate-500">Sales</div>
              <div className="text-xl font-bold">{formatMoney(ytd.totalSales)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Orders</div>
              <div className="text-xl font-bold">{ytd.count}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Tax</div>
              <div className="text-lg font-semibold">{formatMoney(ytd.taxTotal)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Avg Ticket</div>
              <div className="text-lg font-semibold">{formatMoney(ytd.avg)}</div>
            </div>
          </div>
        </div>

        <div className="bg-app-panel dark:bg-app-panel dark:bg-[#0b1220] border rounded-xl shadow-sm p-4 xl:col-span-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-slate-700 dark:text-white/80">
              Sales Over Time (Last 30 Days)
            </div>
            <button
              onClick={() => navigate("/reports/sales-summary")}
              className="text-sm font-semibold text-slate-700 dark:text-white/80 hover:underline"
            >
              View report →
            </button>
          </div>
          <div className="mt-2 text-app-text dark:text-app-text">
            <SimpleLineChart points={salesOverTime30} />
          </div>
        </div>

        <div className="bg-app-panel dark:bg-app-panel dark:bg-[#0b1220] border rounded-xl shadow-sm p-4">
          <div className="text-sm font-bold text-slate-700 dark:text-white/80">Sales per Employee (MTD)</div>
          <div className="mt-3">
            {salesPerEmployeeMTD.length === 0 ? (
              <div className="text-sm text-slate-500">No sales yet this month.</div>
            ) : (
              <SimpleBarList rows={salesPerEmployeeMTD} />
            )}
          </div>
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
  { label: "Backorders", to: "/backorders" },
  { label: "Search", to: "/search" },
  { label: "Settings", to: "/settings" },
];

/* ================= MAIN APP (PIN user) ================= */
function AppInner() {
  const location = useLocation();
  const hideLayout = location.pathname === "/print-receipt";

  const { posAccount, devMode, firebaseUser, terminal } = useSession();

  // ✅ if owner terminal, use firebase user as active "user"
  const user = useMemo(() => {
    if (devMode) {
      return {
        uid: firebaseUser?.uid || null,
        email: firebaseUser?.email || "dev",
        role: "owner",
        shopId: terminal?.shopId,
        tenantId: terminal?.tenantId,
      };
    }

    if (terminal?.mode === "owner") {
      return {
        uid: firebaseUser?.uid || null,
        email: firebaseUser?.email || "owner",
        role: "owner",
        shopId: terminal?.shopId,
        tenantId: terminal?.tenantId,
      };
    }

    if (!posAccount) return null;
    return {
      uid: posAccount.id || null,
      email: posAccount.id || "pos",
      role: posAccount.role || "sales",
      shopId: posAccount.shopId,
      tenantId: posAccount.tenantId,
    };
  }, [posAccount, devMode, firebaseUser, terminal]);

  const isManager = user?.role === "owner" || user?.role === "manager";

  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("theme") === "dark");

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

  /* ✅ LOGOUT HANDLER (ADDED) */
  const handleLogout = async () => {
    try {
      await logoutFirebase();
      window.location.href = "/"; // clean reset so you can jump accounts
    } catch (e) {
      console.error("[logout] failed:", e);
    }
  };

  return (
    <div className="h-screen flex bg-slate-100 dark:bg-app-bg overflow-hidden">
      {!hideLayout && (
        <aside className="w-60 bg-gradient-to-b from-[#0b1220] to-[#0e1626] text-white flex flex-col">
          <div className="px-4 py-5 border-b border-slate-800 flex items-center gap-3">
  <img
    src={logo}
    alt="Voltera Logo"
    className="h-9 w-9 object-contain"
  />

  <div>
    <div className="text-xl font-bold tracking-tight text-white">
      Voltera
    </div>
    <div className="text-xs text-slate-500">
      Car Audio · Fitment · Sales
    </div>
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
                    "flex items-center px-3 py-2 text-sm rounded-md transition-colors border-l-4 border-transparent",
                    isActive
                    ? "bg-brand-primary/15 text-white border-l-4 border-brand-accent"
                    : "text-white/70 hover:bg-white/10 hover:text-white",
                  ].join(" ")
                }
              >
                {item.label}
              </NavLink>
            ))}

            {devMode && (
              <NavLink
                to="/dev"
                className={({ isActive }) =>
                  [
                    "flex items-center px-3 py-2 text-sm rounded-md transition-colors",
                    isActive
                      ? "bg-slate-800 text-white"
                      : "text-white/70 hover:bg-white/10 hover:text-white",
                  ].join(" ")
                }
              >
                Dev
              </NavLink>
            )}
          </nav>

          {/* ✅ LOGOUT BUTTON (ADDED) */}
          <div className="px-2 pb-3">
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center px-3 py-2 text-sm rounded-md transition-colors
           bg-white/5 text-white/80 hover:bg-white/10 hover:text-white border border-white/10">
              🚪 Log Out
            </button>
          </div>

          <div className="px-4 py-3 border-t border-slate-800 text-xs text-slate-400">
            Signed in as: {user?.email}
            {isManager ? " (Manager)" : ""}
            {terminal?.mode === "owner" ? " (OWNER TERMINAL)" : ""}
            {devMode ? " (DEV)" : ""}
          </div>
        </aside>
      )}

      <div className="flex-1 flex flex-col">
        {!hideLayout && (
          <header className="h-14 flex items-center px-6 border-b border-app-border dark:border-app-border border-app-border bg-app-panel dark:bg-app-panel text-app-text dark:bg-[#0b1220]">
            <span className="text-sm font-medium text-slate-700 dark:text-white/80">
              {location.pathname === "/sell"
                ? "Sell"
                : location.pathname === "/inventory"
                ? "Inventory"
                : location.pathname.startsWith("/settings")
                ? "Settings"
                : location.pathname.startsWith("/reports")
                ? "Reports"
                : location.pathname.startsWith("/customers")
                ? "Customers"
                : location.pathname.startsWith("/backorders")
                ? "Backorders"
                : location.pathname.startsWith("/search")
                ? "Master Search"
                : location.pathname.startsWith("/manager")
                ? "Manager"
                : location.pathname.startsWith("/dev")
                ? "Dev"
                : "Dashboard"}
            </span>
          </header>
        )}

        <main className={`flex-1 overflow-y-auto ${hideLayout ? "" : "p-6"}`}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/sell" element={<Sell />} />

            <Route path="/backorders" element={<BackorderCenter />} />
            <Route path="/search" element={<MasterSearch />} />

            <Route path="/customers" element={<Customers />} />
            <Route path="/customers/:id" element={<CustomerDetail />} />

            <Route path="/inventory" element={<Inventory />} />
            <Route path="/inventory/product/:productId" element={<InventoryProductDetail />} />
            <Route path="/inventory/unit/:unitId" element={<InventoryUnitDetail />} />
            <Route path="/inventory/check-in" element={<ProductCheckIn />} />
            <Route path="/manager/coupons" element={<RequireManagerPin> <ManagerCoupons /> </RequireManagerPin>}/>
            <Route path="/held-receipts" element={<HeldReceipts />} />
            <Route path="/reports" element={<ReportsMenu />} />
            <Route path="/reports/sales-summary" element={<ReportSalesSummary />} />
            <Route path="/reports/daily-closeout" element={<ReportDailyCloseout />} />
            <Route path="/reports/inventory-valuation" element={<ReportInventoryValuation />} />
            <Route path="/reports/cogs" element={<ReportCOGSSummary />} />
            <Route path="/reports/backorders" element={<ReportBackorders />} />
            <Route path="/reports/inventory-aging" element={<ReportInventoryAging />} />
            <Route path="/manager/bundles" element={<ManagerBundles />} />
            <Route path="/manager/labor" element={<RequireManagerPin> <ManagerLabor /> </RequireManagerPin>}/>
            <Route
              path="/manager/bundles/new"
              element={
                <RequireManagerPin>
                  <ManagerBundleEditor />
                </RequireManagerPin>
              }
            />
            <Route path="/manager/import" element={<InventoryImport />} /> 
            <Route
              path="/manager/bundles/:bundleId"
              element={
                <RequireManagerPin>
                  <ManagerBundleEditor />
                </RequireManagerPin>
              }
            />
            <Route path="/owner-login" element={<OwnerLogin />} />
            <Route path="/manager" element={<ManagerMenu />} />
            <Route path="/manager/security" element={<ManagerSecurity />} />
            <Route
              path="/manager/backorders"
              element={
                <ManagerSecurity>
                  <BackorderCenter />
                </ManagerSecurity>
              }
            />

            <Route
              path="/manager/employees"
              element={
                <RequireManagerPin>
                  <EmployeesAdmin />
                </RequireManagerPin>
              }
            />

            <Route
              path="/settings"
              element={<Settings user={user} darkMode={darkMode} setDarkMode={setDarkMode} />}
            />
            <Route path="/settings/receipt" element={<ReceiptEditor />} />
            <Route path="/manager/installers" element={<Installers user={user} />} />

            {/* DEV */}
            <Route path="/dev" element={<DevMenu />} />
            <Route path="/dev/accounts" element={<AccountsAdmin />} />
            <Route path="/dev/shops" element={<ShopsAdmin />} />

            {/* Onboarding */}
            <Route path="/accept-invite" element={<AcceptInvite />} />
            <Route path="/invite" element={<InviteCreateAccount />} />

            <Route path="/print-receipt" element={<ReceiptPrint />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

/* ================= TERMINAL GATE ================= */
function TerminalGate() {
  const location = useLocation();

  const session = useSession();
  const terminal = session.terminal;
  const booting = session.booting;
  const isUnlocked = session.isUnlocked;
  const firebaseUser = session.firebaseUser;
  const devMode = session.devMode;

  const path = (location.pathname || "").toLowerCase();
  const hash = (location.hash || "").toLowerCase();

  const isOnboardingRoute =
    path === "/invite" ||
    path.startsWith("/invite") ||
    path === "/accept-invite" ||
    path.startsWith("/accept-invite") ||
    hash.startsWith("#/invite") ||
    hash.startsWith("#/accept-invite");

  // ✅ allow owner login route even if terminal isn't registered yet
  const isOwnerLoginRoute =
    path === "/owner-login" ||
    path.startsWith("/owner-login") ||
    hash.startsWith("#/owner-login");

  if (booting) return <div style={{ padding: 20 }}>Loading…</div>;

  if (devMode) return <AppInner />;

  // allow invite flow without terminal registration / auth / pin
  if (isOnboardingRoute) return <AppInner />;

  // ✅ allow owner login page without terminal registration / auth / pin
  if (isOwnerLoginRoute) return <AppInner />;

  // If terminal is NOT configured:
if (!terminal?.tenantId || !terminal?.shopId) {
  // If someone is signed in (owner/manager), let them into the app without terminal config
  if (firebaseUser) return <AppInner />;

  // Otherwise show the clean entry screen (Product Key vs Owner Login)
  return <Login />;
}

// If terminal IS configured but not signed in (shared terminals need auth for rules):
if (!firebaseUser) return <Login />;

  // ✅ OWNER TERMINAL: signed-in user gets in without PIN
  if (terminal?.mode === "owner") return <AppInner />;

  if (!isUnlocked) return <LockScreen />;

  return <AppInner />;
}

function RequireManagerPin({ children }) {
  const { posAccount, devMode, terminal } = useSession();
  if (devMode) return children;

  // ✅ owner terminal bypass
  if (terminal?.mode === "owner") return children;

  const role = (posAccount?.role || "").toLowerCase();
  const ok = role === "owner" || role === "manager";
  if (!ok) {
    return (
      <div className="inventory-container">
        <div className="empty-state">Not authorized.</div>
      </div>
    );
  }
  return children;
}

/* ================= EXPORT APP ================= */
export default function App() {
  return (
    <SessionProvider>
      <TerminalGate />
    </SessionProvider>
  );
}