import { Link, useRouterState } from "@tanstack/react-router";
import type { FC, ReactNode } from "react";
import { useSelf } from "@/hooks/useUser";
import { AccountSwitcher } from "./AccountSwitcher";

interface DashboardLayoutProps {
  children: ReactNode;
}

const navItems = [
  { href: "/dashboard", label: "ダッシュボード", icon: "🏠" },
  { href: "/dashboard/videos", label: "動画", icon: "🎬" },
  { href: "/dashboard/series", label: "シリーズ", icon: "📚" },
  { href: "/dashboard/playlists", label: "プレイリスト", icon: "📋" },
] as const;

const adminNavItems = [
  {
    href: "/dashboard/admin/system-accounts",
    label: "システムアカウント",
    icon: "👤",
  },
] as const;

export const DashboardLayout: FC<DashboardLayoutProps> = ({ children }) => {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const { data: response } = useSelf();
  const user =
    // biome-ignore lint/suspicious/noExplicitAny: complex type inference
    response?.status === "ok" ? (response as any).data : null;
  const isAdmin = user && "role" in user && user.role === "ADMIN";

  return (
    <div className="dashboard-layout">
      <aside className="dashboard-sidebar">
        <div className="dashboard-sidebar-header">
          <Link to="/" className="dashboard-logo">
            ← サイトに戻る
          </Link>
        </div>
        <AccountSwitcher />
        <nav className="dashboard-nav">
          {navItems.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              activeOptions={{ exact: true }}
              className={`dashboard-nav-item ${
                pathname === item.href ? "active" : ""
              }`}
            >
              <span className="dashboard-nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
          {isAdmin && (
            <>
              <div className="dashboard-nav-divider" />
              <div className="dashboard-nav-section">管理者</div>
              {adminNavItems.map((item) => (
                <Link
                  key={item.href}
                  to={item.href}
                  activeOptions={{ exact: true }}
                  className={`dashboard-nav-item ${
                    pathname === item.href ? "active" : ""
                  }`}
                >
                  <span className="dashboard-nav-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </>
          )}
        </nav>
      </aside>
      <main className="dashboard-main">{children}</main>
    </div>
  );
};

export default DashboardLayout;
