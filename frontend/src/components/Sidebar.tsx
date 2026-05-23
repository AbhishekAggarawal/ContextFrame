import { NavLink, useLocation } from "react-router-dom";
import {
  Home,
  Upload,
  MessageSquare,
  FileText,
  Activity,
  Sparkles,
  Zap,
} from "lucide-react";

const navItems = [
  { to: "/", icon: Home, label: "Dashboard" },
  { to: "/upload", icon: Upload, label: "New Analysis" },
  { to: "/chat", icon: MessageSquare, label: "Chat" },
  { to: "/results", icon: FileText, label: "Results" },
  { to: "/history", icon: Activity, label: "History" },
];

export default function Sidebar() {
  const location = useLocation();

  return (
    <aside
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: 260,
        height: "100vh",
        background: "var(--bg-secondary)",
        borderRight: "1px solid var(--border-color)",
        display: "flex",
        flexDirection: "column",
        zIndex: 100,
        padding: "0 16px",
      }}
    >
      {/* Logo */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "24px 8px 32px",
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: "var(--radius-md)",
            background: "var(--gradient-hero)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "var(--shadow-glow)",
          }}
        >
          <Sparkles size={22} color="#fff" />
        </div>
        <div>
          <div style={{ fontSize: "1.05rem", fontWeight: 700, lineHeight: 1.2 }}>
            <span className="gradient-text">ContextFrame</span>
          </div>
          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", letterSpacing: "0.05em" }}>
            ASSISTANT
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, paddingTop: 16, display: "flex", flexDirection: "column", gap: 4 }}>
        {navItems.map(({ to, icon: Icon, label }) => {
          const isActive = location.pathname === to;
          return (
            <NavLink
              key={to}
              to={to}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                borderRadius: "var(--radius-md)",
                textDecoration: "none",
                color: isActive ? "#fff" : "var(--text-secondary)",
                background: isActive ? "rgba(99, 102, 241, 0.15)" : "transparent",
                border: isActive ? "1px solid var(--accent-primary)" : "1px solid transparent",
                fontWeight: isActive ? 600 : 400,
                transition: "all 0.2s ease",
                fontSize: "0.9rem",
              }}
            >
              <Icon size={18} />
              {label}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div
        style={{
          padding: "20px 8px",
          borderTop: "1px solid var(--border-color)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Zap size={14} color="var(--success)" />
        <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
          AI Powered by Mistral + Whisper
        </span>
      </div>
    </aside>
  );
}