import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { useSelf } from "@/hooks/useUser";
import { client } from "@/lib/client";
import { getAuthConfig } from "@/service/getAuthConfig";

export const Route = createFileRoute("/_app/dashboard/")({
  head: () => ({ meta: [{ title: "ダッシュボード" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { data: response, isLoading } = useSelf();
  // biome-ignore lint/suspicious/noExplicitAny: complex type inference
  const user = response?.status === "ok" ? (response as any).data : null;
  const [ssoDisplayName, setSsoDisplayName] = useState<string | null>(null);

  useEffect(() => {
    void getAuthConfig().then((config) => {
      if (config?.ssoEnabled) {
        setSsoDisplayName(config.ssoDisplayName);
      }
    });
  }, []);

  // Starts the account-link flow: POST /auth/sso/link returns the provider
  // authorization URL, which the browser then navigates to.
  const handleLinkSso = async () => {
    try {
      const res = await client.api.v4.auth.sso.link.$post({
        query: { callback: "/dashboard" },
      });
      const body = await res.json();
      if (body.status === "ok") {
        window.location.assign(body.data);
      }
    } catch {
      // fall through: do nothing on failure (button is best-effort)
    }
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return (
      <div className="dashboard-auth-required">
        <p>ダッシュボードにアクセスするにはログインが必要です。</p>
        <Link to="/login">ログイン</Link>
      </div>
    );
  }

  return (
    <>
      <div className="dashboard-home">
        <h1>ようこそ、{user.name}さん</h1>
        <div className="dashboard-cards">
          <Link to="/dashboard/videos/new" className="dashboard-card">
            <span className="dashboard-card-icon">📤</span>
            <span className="dashboard-card-title">動画をアップロード</span>
          </Link>
          <Link to="/dashboard/videos" className="dashboard-card">
            <span className="dashboard-card-icon">🎬</span>
            <span className="dashboard-card-title">動画を管理</span>
          </Link>
          <Link to="/dashboard/series/new" className="dashboard-card">
            <span className="dashboard-card-icon">📚</span>
            <span className="dashboard-card-title">シリーズを作成</span>
          </Link>
          <Link to="/dashboard/playlists/new" className="dashboard-card">
            <span className="dashboard-card-icon">📋</span>
            <span className="dashboard-card-title">プレイリストを作成</span>
          </Link>
          {ssoDisplayName && (
            <button
              type="button"
              className="dashboard-card"
              onClick={handleLinkSso}
            >
              <span className="dashboard-card-icon">🔗</span>
              <span className="dashboard-card-title">
                {ssoDisplayName}と連携
              </span>
            </button>
          )}
        </div>
      </div>
      <style>{`
        .dashboard-home h1 {
          margin-bottom: 2rem;
          color: var(--text-primary, #fff);
        }
        .dashboard-cards {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 1rem;
        }
        .dashboard-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          padding: 2rem;
          background: var(--background-primary, #0d0d0d);
          border: 1px solid var(--border-color, #333);
          border-radius: 12px;
          text-decoration: none;
          transition: all 0.2s;
          cursor: pointer;
          font: inherit;
        }
        .dashboard-card:hover {
          border-color: var(--primary-color, #3b82f6);
          transform: translateY(-2px);
        }
        .dashboard-card-icon {
          font-size: 2.5rem;
        }
        .dashboard-card-title {
          color: var(--text-primary, #fff);
          font-weight: 500;
        }
        .dashboard-auth-required {
          text-align: center;
          padding: 4rem;
        }
        .dashboard-auth-required p {
          margin-bottom: 1rem;
          color: var(--text-secondary, #999);
        }
        .dashboard-auth-required a {
          color: var(--primary-color, #3b82f6);
        }
      `}</style>
    </>
  );
}
