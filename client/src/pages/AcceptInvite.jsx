// client/src/pages/AcceptInvite.jsx
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { acceptTenantInvite } from "../services/authService";

export default function AcceptInvite() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [status, setStatus] = useState("working"); // working | done | error
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        if (!token) throw new Error("Missing invite token.");
        await acceptTenantInvite(token);
        setStatus("done");
        setMsg("Invite accepted. Your account is linked.");
        setTimeout(() => navigate("/", { replace: true }), 500);
      } catch (e) {
        console.error(e);
        setStatus("error");
        setMsg(e?.message || String(e));
      }
    })();
  }, [token, navigate]);

  return (
    <div className="inventory-container">
      <div className="table-wrapper" style={{ padding: 16 }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>Accept Invite</div>
        <div style={{ marginTop: 10, opacity: 0.8 }}>
          {status === "working" ? "Linking your account..." : msg}
        </div>
        {status === "error" ? (
          <div style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>
            Make sure you are signed into the same email that received the invite.
          </div>
        ) : null}
      </div>
    </div>
  );
}
