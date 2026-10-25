import { Link, useRouterState } from "@tanstack/react-router";
import { Film, House, Library, ListVideo, Users } from "lucide-react";
import type { FC, ReactNode } from "react";
import { DashboardLoading } from "@/components/Dashboard/DashboardLoading";
import { useSelf } from "@/hooks/useUser";
import { AccountSwitcher } from "./AccountSwitcher";

interface DashboardLayoutProps {
  children: ReactNode;
}

const navItems = [
  { href: "/dashboard", label: "ダッシュボード", icon: House },
  { href: "/dashboard/videos", label: "動画", icon: Film },
  { href: "/dashboard/series", label: "シリーズ", icon: Library },
  { href: "/dashboard/playlists", label: "プレイリスト", icon: ListVideo },
] as const;

const adminNavItems = [
  {
    href: "/dashboard/admin/system-accounts",
    label: "システムアカウント",
    icon: Users,
  },
] as const;

export const DashboardLayout: FC<DashboardLayoutProps> = ({ children }) => {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const { data: user, isLoading } = useSelf();
  const isAdmin = user && "role" in user && user.role === "ADMIN";

  if (isLoading) return <DashboardLoading />;
  if (!user) {
    return (
      <div className="dashboard-auth-required">
        <p>ダッシュボードにアクセスするにはログインが必要です。</p>
        <Link to="/login" search={{ callback: pathname }}>
          ログイン
        </Link>
      </div>
    );
  }

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
              activeOptions={{ exact: item.href === "/dashboard" }}
              aria-current={
                item.href === "/dashboard"
                  ? pathname === item.href
                    ? "page"
                    : undefined
                  : pathname === item.href ||
                      pathname.startsWith(`${item.href}/`)
                    ? "page"
                    : undefined
              }
              className={`dashboard-nav-item ${
                item.href === "/dashboard"
                  ? pathname === item.href
                    ? "active"
                    : ""
                  : pathname === item.href ||
                      pathname.startsWith(`${item.href}/`)
                    ? "active"
                    : ""
              }`}
            >
              <item.icon
                aria-hidden="true"
                className="dashboard-nav-icon size-5"
              />
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
                  activeOptions={{ exact: false }}
                  aria-current={
                    pathname.startsWith(item.href) ? "page" : undefined
                  }
                  className={`dashboard-nav-item ${
                    pathname.startsWith(item.href) ? "active" : ""
                  }`}
                >
                  <item.icon
                    aria-hidden="true"
                    className="dashboard-nav-icon size-5"
                  />
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
