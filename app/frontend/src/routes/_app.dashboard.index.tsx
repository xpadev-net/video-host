import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { useSelf } from "@/hooks/useUser";
import { authClient } from "@/lib/auth-client";
import { type AuthConfig, getAuthConfig } from "@/service/getAuthConfig";

export const Route = createFileRoute("/_app/dashboard/")({
  head: () => ({ meta: [{ title: "ダッシュボード" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { data: response, isLoading } = useSelf();
  // biome-ignore lint/suspicious/noExplicitAny: complex type inference
  const user = response?.status === "ok" ? (response as any).data : null;
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState("");
  const linkPending = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void getAuthConfig().then((config) => {
      if (!cancelled) setAuthConfig(config);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLinkSso = async () => {
    if (
      !authConfig?.accountLinkingEnabled ||
      !authConfig.ssoProviderId ||
      linkPending.current
    )
      return;
    linkPending.current = true;
    setLinking(true);
    setLinkError("");
    try {
      const { error } = await authClient.linkSocial({
        provider: authConfig.ssoProviderId,
        callbackURL: new URL("/auth/link", window.location.origin).href,
        errorCallbackURL: new URL(
          "/auth/link?error=link_failed",
          window.location.origin,
        ).href,
      });
      if (error) throw new Error(error.message);
    } catch {
      setLinkError("SSO連携を開始できませんでした。もう一度お試しください");
      linkPending.current = false;
      setLinking(false);
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
          {authConfig?.accountLinkingEnabled && authConfig.ssoProviderId && (
            <button
              type="button"
              className="dashboard-card"
              onClick={handleLinkSso}
              disabled={linking}
            >
              <span className="dashboard-card-icon">🔗</span>
              <span className="dashboard-card-title">
                {linking ? "連携中..." : `${authConfig.ssoDisplayName}と連携`}
              </span>
            </button>
          )}
        </div>
        {linkError && (
          <p role="alert" className="text-destructive">
            {linkError}
          </p>
        )}
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
