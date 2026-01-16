import Link from "next/link";
import { useRouter } from "next/router";
import type { FC, ReactNode } from "react";
import { useSelf } from "@/hooks/useUser";
import { getUserData } from "@/utils/userResponse";
import { AccountSwitcher } from "./AccountSwitcher";

interface DashboardLayoutProps {
  children: ReactNode;
}

const navItems = [
  { href: "/dashboard", label: "ダッシュボード", icon: "🏠" },
  { href: "/dashboard/videos", label: "動画", icon: "🎬" },
  { href: "/dashboard/series", label: "シリーズ", icon: "📚" },
  { href: "/dashboard/playlists", label: "プレイリスト", icon: "📋" },
];

const adminNavItems = [
  {
    href: "/dashboard/admin/system-accounts",
    label: "システムアカウント",
    icon: "👤",
  },
];

export const DashboardLayout: FC<DashboardLayoutProps> = ({ children }) => {
  const router = useRouter();
  const { data: response } = useSelf();
  const user = getUserData(response);
  const isAdmin = user?.role === "ADMIN";

  return (
    <div className="dashboard-layout">
      <aside className="dashboard-sidebar">
        <div className="dashboard-sidebar-header">
          <Link href="/" className="dashboard-logo">
            ← サイトに戻る
          </Link>
        </div>
        <AccountSwitcher />
        <nav className="dashboard-nav">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`dashboard-nav-item ${
                router.pathname === item.href ? "active" : ""
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
                  href={item.href}
                  className={`dashboard-nav-item ${
                    router.pathname === item.href ? "active" : ""
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
      <style jsx>{`
        .dashboard-layout {
          display: flex;
          min-height: 100vh;
          background: var(--background-secondary, #1a1a1a);
        }
        .dashboard-sidebar {
          width: 240px;
          background: var(--background-primary, #0d0d0d);
          border-right: 1px solid var(--border-color, #333);
          display: flex;
          flex-direction: column;
        }
        .dashboard-sidebar-header {
          padding: 1rem;
          border-bottom: 1px solid var(--border-color, #333);
        }
        .dashboard-logo {
          color: var(--text-secondary, #999);
          text-decoration: none;
          font-size: 0.875rem;
        }
        .dashboard-logo:hover {
          color: var(--text-primary, #fff);
        }
        .dashboard-nav {
          padding: 0.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .dashboard-nav-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          border-radius: 8px;
          color: var(--text-secondary, #999);
          text-decoration: none;
          transition: all 0.2s;
        }
        .dashboard-nav-item:hover {
          background: var(--background-tertiary, #252525);
          color: var(--text-primary, #fff);
        }
        .dashboard-nav-item.active {
          background: var(--primary-color, #3b82f6);
          color: white;
        }
        .dashboard-nav-icon {
          font-size: 1.25rem;
        }
        .dashboard-nav-divider {
          height: 1px;
          background: var(--border-color, #333);
          margin: 0.5rem 0;
        }
        .dashboard-nav-section {
          padding: 0.5rem 1rem;
          font-size: 0.75rem;
          color: var(--text-tertiary, #666);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .dashboard-main {
          flex: 1;
          padding: 2rem;
          overflow-y: auto;
        }
      `}</style>
    </div>
  );
};

export default DashboardLayout;
