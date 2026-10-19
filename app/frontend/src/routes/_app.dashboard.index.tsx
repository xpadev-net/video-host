import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Film, Link2, ListVideo, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { DashboardLoading } from "@/components/Dashboard/DashboardLoading";
import { useAuthConfig } from "@/hooks/useAuthConfig";
import { useSelf } from "@/hooks/useUser";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_app/dashboard/")({
  head: () => ({ meta: [{ title: "ダッシュボード" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { data: user, isLoading } = useSelf();
  const { authConfig } = useAuthConfig();
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState("");
  const linkPending = useRef(false);

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
    return <DashboardLoading />;
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
            <Upload
              aria-hidden="true"
              className="dashboard-card-icon size-10"
            />
            <span className="dashboard-card-title">動画をアップロード</span>
          </Link>
          <Link to="/dashboard/videos" className="dashboard-card">
            <Film aria-hidden="true" className="dashboard-card-icon size-10" />
            <span className="dashboard-card-title">動画を管理</span>
          </Link>
          <Link to="/dashboard/series/new" className="dashboard-card">
            <BookOpen
              aria-hidden="true"
              className="dashboard-card-icon size-10"
            />
            <span className="dashboard-card-title">シリーズを作成</span>
          </Link>
          <Link to="/dashboard/playlists/new" className="dashboard-card">
            <ListVideo
              aria-hidden="true"
              className="dashboard-card-icon size-10"
            />
            <span className="dashboard-card-title">プレイリストを作成</span>
          </Link>
          {authConfig?.accountLinkingEnabled && authConfig.ssoProviderId && (
            <button
              type="button"
              className="dashboard-card"
              onClick={handleLinkSso}
              disabled={linking}
            >
              <Link2
                aria-hidden="true"
                className="dashboard-card-icon size-10"
              />
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
    </>
  );
}
