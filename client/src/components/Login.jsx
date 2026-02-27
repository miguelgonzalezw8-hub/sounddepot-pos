import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";

export default function Login() {
  const nav = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState("terminal"); // "terminal" | "owner"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const m = params.get("mode");
    setMode(m === "owner" ? "owner" : "terminal");
  }, [location.search]);

  const handleOwnerLogin = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setError("Invalid credentials");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm bg-white rounded-xl p-6 space-y-4 shadow">
        {/* LOGO */}
        <div className="flex justify-center mb-2">
          <img
            src="/logo.png"
            alt="Logo"
            className="h-10 object-contain"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
        </div>

        {mode === "terminal" ? (
          <>
            <h1 className="text-lg font-bold text-slate-800 text-center">
              Terminal Setup
            </h1>

            <button
              type="button"
              onClick={() => nav("/terminal-setup")}
              className="w-full bg-brand-primary hover:bg-brand-primary/90 text-white py-2 rounded font-semibold"
            >
              Enter Product Key
            </button>

            <button
              type="button"
              onClick={() => nav("/login?mode=owner")}
              className="w-full border border-slate-300 py-2 rounded font-semibold text-slate-700 hover:bg-slate-50"
            >
              Owner Login
            </button>
          </>
        ) : (
          <>
            <h1 className="text-lg font-bold text-slate-800 text-center">
              Owner Login
            </h1>

            {error && (
              <p className="text-sm text-red-500 text-center">{error}</p>
            )}

            <form onSubmit={handleOwnerLogin} className="space-y-3">
              <input
                type="email"
                placeholder="Email"
                className="w-full p-2 rounded border border-slate-300"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <input
                type="password"
                placeholder="Password"
                className="w-full p-2 rounded border border-slate-300"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <button
                type="submit"
                className="w-full bg-brand-primary hover:bg-brand-primary/90 text-white py-2 rounded font-semibold"
              >
                Sign In
              </button>
            </form>

            <button
              type="button"
              onClick={() => nav("/login")}
              className="w-full border border-slate-300 py-2 rounded font-semibold text-slate-700 hover:bg-slate-50"
            >
              Back
            </button>
          </>
        )}
      </div>
    </div>
  );
}