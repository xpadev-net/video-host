import axios from "axios";
import { useAtomValue } from "jotai";
import Head from "next/head";
import Link from "next/link";
import { type FC, useState } from "react";
import { AuthTokenAtom } from "@/atoms/Auth";
import { DashboardLayout } from "@/components/Dashboard/DashboardLayout";
import { useMySeries } from "@/hooks/useDashboard";
import { useSelf } from "@/hooks/useUser";

const API_URL = process.env.NEXT_PUBLIC_API_ENDPOINT || "";

const SeriesPage: FC = () => {
  const token = useAtomValue(AuthTokenAtom);
  const { data: user, isLoading: isUserLoading } = useSelf();
  const { data: seriesData, mutate } = useMySeries();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm("このシリーズを削除しますか？動画は削除されません。")) return;

    setDeletingId(id);
    try {
      await axios.delete(`${API_URL}/api/v4/series/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      mutate();
    } catch (_err) {
      alert("削除に失敗しました");
    } finally {
      setDeletingId(null);
    }
  };

  if (isUserLoading) {
    return (
      <DashboardLayout>
        <div>Loading...</div>
      </DashboardLayout>
    );
  }

  if (!user) {
    return (
      <DashboardLayout>
        <div>ログインしてください</div>
      </DashboardLayout>
    );
  }

  const seriesList = seriesData?.items || [];

  return (
    <DashboardLayout>
      <Head>
        <title>シリーズ管理</title>
      </Head>
      <div className="series-page">
        <div className="page-header">
          <h1>シリーズ管理</h1>
          <Link href="/dashboard/series/new" className="new-button">
            + 新規作成
          </Link>
        </div>

        {seriesList.length === 0 ? (
          <div className="empty-state">
            <p>シリーズがありません</p>
            <Link href="/dashboard/series/new">最初のシリーズを作成</Link>
          </div>
        ) : (
          <div className="series-list">
            {seriesList.map(
              (series: {
                id: string;
                title: string;
                visibility: string;
                movies?: unknown[];
              }) => (
                <div key={series.id} className="series-item">
                  <div className="series-info">
                    <h3>{series.title}</h3>
                    <div className="series-meta">
                      <span
                        className={`visibility-badge ${series.visibility.toLowerCase()}`}
                      >
                        {series.visibility === "PUBLIC"
                          ? "公開"
                          : series.visibility === "UNLISTED"
                            ? "限定公開"
                            : "非公開"}
                      </span>
                      <span>{series.movies?.length || 0}本の動画</span>
                    </div>
                  </div>
                  <div className="series-actions">
                    <Link
                      href={`/dashboard/series/${series.id}/edit`}
                      className="action-btn"
                    >
                      編集
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDelete(series.id)}
                      disabled={deletingId === series.id}
                      className="action-btn delete"
                    >
                      {deletingId === series.id ? "削除中..." : "削除"}
                    </button>
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </div>
      <style jsx>{`
        .series-page h1 { color: var(--text-primary, #fff); }
        .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }
        .new-button { padding: 0.75rem 1.25rem; background: var(--primary-color, #3b82f6); color: white; text-decoration: none; border-radius: 8px; font-weight: 500; }
        .empty-state { text-align: center; padding: 4rem; color: var(--text-secondary, #999); }
        .empty-state a { color: var(--primary-color, #3b82f6); }
        .series-list { display: flex; flex-direction: column; gap: 1rem; }
        .series-item { display: flex; align-items: center; justify-content: space-between; padding: 1rem; background: var(--background-primary, #0d0d0d); border: 1px solid var(--border-color, #333); border-radius: 12px; }
        .series-info h3 { color: var(--text-primary, #fff); margin: 0 0 0.5rem; }
        .series-meta { display: flex; align-items: center; gap: 0.75rem; color: var(--text-secondary, #999); font-size: 0.875rem; }
        .visibility-badge { padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; }
        .visibility-badge.public { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
        .visibility-badge.unlisted { background: rgba(234, 179, 8, 0.2); color: #eab308; }
        .visibility-badge.private { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
        .series-actions { display: flex; gap: 0.5rem; }
        .action-btn { padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.875rem; text-decoration: none; cursor: pointer; border: 1px solid var(--border-color, #333); background: transparent; color: var(--text-primary, #fff); }
        .action-btn:hover { background: var(--background-tertiary, #252525); }
        .action-btn.delete { color: #ef4444; border-color: #ef4444; }
        .action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </DashboardLayout>
  );
};

export default SeriesPage;
