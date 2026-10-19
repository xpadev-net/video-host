import { createFileRoute, Link } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { Film } from "lucide-react";
import { type SetStateAction, useCallback, useState } from "react";
import { selectedAccountIdAtom } from "@/atoms/SelectedAccount";
import { DashboardLoading } from "@/components/Dashboard/DashboardLoading";
import { PaginationControls } from "@/components/Dashboard/PaginationControls";
import { useConfirm, useNotify } from "@/components/Feedback/FeedbackProvider";
import { useMyMovies } from "@/hooks/useDashboard";
import { useSelf } from "@/hooks/useUser";
import { client } from "@/lib/client";
import { visibility2str } from "@/utils/visibility2str";

export const Route = createFileRoute("/_app/dashboard/videos/")({
  head: () => ({ meta: [{ title: "動画管理" }] }),
  component: VideosPage,
});

function VideosPage() {
  const { data: user, isLoading: isUserLoading } = useSelf();
  const selectedAccountId = useAtomValue(selectedAccountIdAtom);
  const [pagination, setPagination] = useState({
    accountId: selectedAccountId,
    page: 1,
  });
  const page = pagination.accountId === selectedAccountId ? pagination.page : 1;
  const setPage = useCallback(
    (nextPage: SetStateAction<number>) => {
      setPagination((current) => {
        const currentPage =
          current.accountId === selectedAccountId ? current.page : 1;
        return {
          accountId: selectedAccountId,
          page:
            typeof nextPage === "function" ? nextPage(currentPage) : nextPage,
        };
      });
    },
    [selectedAccountId],
  );
  const { data: moviesData, error, mutate } = useMyMovies(page);
  const confirm = useConfirm();
  const notify = useNotify();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const handleDelete = async (id: string) => {
    if (
      !(await confirm({
        title: "動画を削除しますか？",
        description: "削除した動画は元に戻せません。",
        confirmLabel: "削除",
        destructive: true,
      }))
    )
      return;

    setDeletingId(id);
    try {
      const res = await client.api.v4.movies[":movie"].$delete({
        param: { movie: id },
      });

      if (!res.ok) {
        throw new Error("Failed to delete");
      }

      if (movies.length === 1 && page > 1) setPage((current) => current - 1);
      else mutate();
    } catch (_err) {
      notify("削除に失敗しました");
    } finally {
      setDeletingId(null);
    }
  };

  if (isUserLoading) {
    return <DashboardLoading />;
  }

  if (!user) {
    return <div>ログインしてください</div>;
  }

  const movies = moviesData?.items || [];

  return (
    <>
      <div className="videos-page">
        <div className="page-header">
          <h1>動画管理</h1>
          <Link to="/dashboard/videos/new" className="new-button">
            + 新規アップロード
          </Link>
        </div>

        {error ? (
          <div className="empty-state" role="alert">
            <p>動画を読み込めませんでした</p>
            <button
              className="action-btn"
              onClick={() => void mutate()}
              type="button"
            >
              再試行
            </button>
            {page > 1 && (
              <button
                className="action-btn"
                onClick={() => setPage(page - 1)}
                type="button"
              >
                前のページへ戻る
              </button>
            )}
          </div>
        ) : movies.length === 0 ? (
          <div className="empty-state">
            <p>動画がありません</p>
            <Link to="/dashboard/videos/new">最初の動画をアップロード</Link>
          </div>
        ) : (
          <div className="videos-list">
            {movies.map((movie) => (
              <div key={movie.id} className="video-item">
                <div className="video-thumbnail">
                  {movie.thumbnailUrl ? (
                    <img
                      src={movie.thumbnailUrl}
                      alt={movie.title}
                      width="160"
                      height="90"
                      style={{ objectFit: "cover" }}
                    />
                  ) : (
                    <div className="thumbnail-placeholder">
                      <Film aria-hidden="true" />
                    </div>
                  )}
                </div>
                <div className="video-info">
                  <h3 className="video-title">{movie.title}</h3>
                  <div className="video-meta">
                    <span
                      className={`visibility-badge ${movie.visibility.toLowerCase()}`}
                    >
                      {visibility2str(movie.visibility)}
                    </span>
                    {movie.variants?.[0]?.status === "UPLOADING" && (
                      <span className="animate-pulse rounded bg-[rgba(234,179,8,0.2)] px-2 py-1 text-xs font-medium text-[#eab308]">
                        アップロード中
                      </span>
                    )}
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
                    to="/dashboard/videos/$id/edit"
                    params={{ id: movie.id }}
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
        {!error && moviesData?.pagination && (
          <PaginationControls
            onPageChange={setPage}
            page={page}
            totalCount={moviesData.pagination.totalCount}
            totalPages={moviesData.pagination.totalPages}
          />
        )}
      </div>
    </>
  );
}
