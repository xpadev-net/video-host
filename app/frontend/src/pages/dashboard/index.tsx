import Head from "next/head";
import Link from "next/link";
import type { FC } from "react";
import { DashboardLayout } from "@/components/Dashboard/DashboardLayout";
import { useSelf } from "@/hooks/useUser";

const DashboardPage: FC = () => {
  const { data: response, isLoading } = useSelf();
  // biome-ignore lint/suspicious/noExplicitAny: complex type inference
  const user = response?.status === "ok" ? (response as any).data : null;

  if (isLoading) {
    return (
      <DashboardLayout>
        <div>Loading...</div>
      </DashboardLayout>
    );
  }

  if (!user) {
    return (
      <DashboardLayout>
        <div className="dashboard-auth-required">
          <p>ダッシュボードにアクセスするにはログインが必要です。</p>
          <Link href="/users/login">ログイン</Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Head>
        <title>ダッシュボード</title>
      </Head>
      <div className="dashboard-home">
        <h1>ようこそ、{user.name}さん</h1>
        <div className="dashboard-cards">
          <Link href="/dashboard/videos/new" className="dashboard-card">
            <span className="dashboard-card-icon">📤</span>
            <span className="dashboard-card-title">動画をアップロード</span>
          </Link>
          <Link href="/dashboard/videos" className="dashboard-card">
            <span className="dashboard-card-icon">🎬</span>
            <span className="dashboard-card-title">動画を管理</span>
          </Link>
          <Link href="/dashboard/series/new" className="dashboard-card">
            <span className="dashboard-card-icon">📚</span>
            <span className="dashboard-card-title">シリーズを作成</span>
          </Link>
          <Link href="/dashboard/playlists/new" className="dashboard-card">
            <span className="dashboard-card-icon">📋</span>
            <span className="dashboard-card-title">プレイリストを作成</span>
          </Link>
        </div>
      </div>
      <style jsx>{`
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
    </DashboardLayout>
  );
};

export default DashboardPage;
