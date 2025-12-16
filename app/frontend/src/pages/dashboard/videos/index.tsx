import axios from "axios";
import { useAtomValue } from "jotai";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { type FC, useState } from "react";
import { AuthTokenAtom } from "@/atoms/Auth";
import { DashboardLayout } from "@/components/Dashboard/DashboardLayout";
import { useMyMovies } from "@/hooks/useDashboard";
import { useSelf } from "@/hooks/useUser";

const API_URL = process.env.NEXT_PUBLIC_API_ENDPOINT || "";

const VideosPage: FC = () => {
  const token = useAtomValue(AuthTokenAtom);
  const { data: user, isLoading: isUserLoading } = useSelf();
  const { data: moviesData, mutate } = useMyMovies();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm("この動画を削除しますか？")) return;

    setDeletingId(id);
    try {
      await axios.delete(`${API_URL}movies/${id}`, {
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

  const movies = moviesData?.items || [];

  return (
    <DashboardLayout>
      <Head>
        <title>動画管理</title>
      </Head>
      <div className="videos-page">
        <div className="page-header">
          <h1>動画管理</h1>
          <Link href="/dashboard/videos/new" className="new-button">
            + 新規アップロード
          </Link>
        </div>

        {movies.length === 0 ? (
          <div className="empty-state">
            <p>動画がありません</p>
            <Link href="/dashboard/videos/new">最初の動画をアップロード</Link>
          </div>
        ) : (
          <div className="videos-list">
            {movies.map((movie) => (
              <div key={movie.id} className="video-item">
                <div className="video-thumbnail">
                  {movie.thumbnailUrl ? (
                    <Image
                      src={movie.thumbnailUrl}
                      alt={movie.title}
                      width={160}
                      height={90}
                      style={{ objectFit: "cover" }}
                    />
                  ) : (
                    <div className="thumbnail-placeholder">🎬</div>
                  )}
                </div>
                <div className="video-info">
                  <h3 className="video-title">{movie.title}</h3>
                  <div className="video-meta">
                    <span
                      className={`visibility-badge ${movie.visibility.toLowerCase()}`}
                    >
                      {movie.visibility === "PUBLIC"
                        ? "公開"
                        : movie.visibility === "UNLISTED"
                          ? "限定公開"
                          : "非公開"}
                    </span>
                    {movie.variants?.[0]?.status === "PROCESSING" && (
                      <span className="status-badge encoding">
                        エンコード中
                      </span>
                    )}
                    {movie.variants?.[0]?.status === "FAILED" && (
                      <span className="status-badge failed">
                        エンコード失敗
                      </span>
                    )}
                    {movie.variants?.[0]?.status === "READY" && (
                      <span className="video-duration">
                        {Math.floor(movie.duration / 60)}:
                        {(movie.duration % 60).toString().padStart(2, "0")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="video-actions">
                  <Link
                    href={`/dashboard/videos/${movie.id}/edit`}
                    className="action-btn"
                  >
                    編集
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDelete(movie.id)}
                    disabled={deletingId === movie.id}
                    className="action-btn delete"
                  >
                    {deletingId === movie.id ? "削除中..." : "削除"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <style jsx>{`
        .videos-page h1 {
          color: var(--text-primary, #fff);
        }
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
        }
        .new-button {
          padding: 0.75rem 1.25rem;
          background: var(--primary-color, #3b82f6);
          color: white;
          text-decoration: none;
          border-radius: 8px;
          font-weight: 500;
        }
        .new-button:hover {
          background: #2563eb;
        }
        .empty-state {
          text-align: center;
          padding: 4rem;
          color: var(--text-secondary, #999);
        }
        .empty-state a {
          color: var(--primary-color, #3b82f6);
        }
        .videos-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .video-item {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem;
          background: var(--background-primary, #0d0d0d);
          border: 1px solid var(--border-color, #333);
          border-radius: 12px;
        }
        .video-thumbnail {
          width: 160px;
          height: 90px;
          border-radius: 8px;
          overflow: hidden;
          background: var(--background-tertiary, #252525);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .video-thumbnail img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .thumbnail-placeholder {
          font-size: 2rem;
        }
        .video-info {
          flex: 1;
        }
        .video-title {
          color: var(--text-primary, #fff);
          margin: 0 0 0.5rem;
        }
        .video-meta {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .visibility-badge {
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
        }
        .visibility-badge.public {
          background: rgba(34, 197, 94, 0.2);
          color: #22c55e;
        }
        .visibility-badge.unlisted {
          background: rgba(234, 179, 8, 0.2);
          color: #eab308;
        }
        .visibility-badge.private {
          background: rgba(239, 68, 68, 0.2);
          color: #ef4444;
        }
        .status-badge {
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 500;
        }
        .status-badge.encoding {
          background: rgba(59, 130, 246, 0.2);
          color: #3b82f6;
          animation: pulse 2s infinite;
        }
        .status-badge.failed {
          background: rgba(239, 68, 68, 0.2);
          color: #ef4444;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .video-duration {
          color: var(--text-secondary, #999);
          font-size: 0.875rem;
        }
        .video-actions {
          display: flex;
          gap: 0.5rem;
        }
        .action-btn {
          padding: 0.5rem 1rem;
          border-radius: 6px;
          font-size: 0.875rem;
          text-decoration: none;
          cursor: pointer;
          border: 1px solid var(--border-color, #333);
          background: transparent;
          color: var(--text-primary, #fff);
        }
        .action-btn:hover {
          background: var(--background-tertiary, #252525);
        }
        .action-btn.delete {
          color: #ef4444;
          border-color: #ef4444;
        }
        .action-btn.delete:hover {
          background: rgba(239, 68, 68, 0.1);
        }
        .action-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </DashboardLayout>
  );
};

export default VideosPage;
