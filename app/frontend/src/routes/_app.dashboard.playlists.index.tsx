import { createFileRoute, Link } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { selectedAccountIdAtom } from "@/atoms/SelectedAccount";
import { DashboardLoading } from "@/components/Dashboard/DashboardLoading";
import { PaginationControls } from "@/components/Dashboard/PaginationControls";
import { useConfirm, useNotify } from "@/components/Feedback/FeedbackProvider";
import { useMyPlaylists } from "@/hooks/useDashboard";
import { useSelf } from "@/hooks/useUser";
import { client } from "@/lib/client";
import { visibility2str } from "@/utils/visibility2str";

export const Route = createFileRoute("/_app/dashboard/playlists/")({
  head: () => ({ meta: [{ title: "プレイリスト管理" }] }),
  component: PlaylistsPage,
});

function PlaylistsPage() {
  const { data: user, isLoading: isUserLoading } = useSelf();
  const selectedAccountId = useAtomValue(selectedAccountIdAtom);
  const [page, setPage] = useState(1);
  const { data: playlistsData, mutate } = useMyPlaylists(page);
  const confirm = useConfirm();
  const notify = useNotify();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const previousAccountId = useRef(selectedAccountId);

  useEffect(() => {
    if (previousAccountId.current !== selectedAccountId) {
      previousAccountId.current = selectedAccountId;
      setPage(1);
    }
  }, [selectedAccountId]);

  const handleDelete = async (id: string) => {
    if (
      !(await confirm({
        title: "プレイリストを削除しますか？",
        description: "削除したプレイリストは元に戻せません。",
        confirmLabel: "削除",
        destructive: true,
      }))
    )
      return;
    setDeletingId(id);
    try {
      const res = await client.api.v4.playlists[":playlist"].$delete({
        param: { playlist: id },
      });

      if (!res.ok) {
        throw new Error("Failed to delete");
      }

      if (playlists.length === 1 && page > 1) setPage((current) => current - 1);
      else mutate();
    } catch {
      notify("削除に失敗しました");
    } finally {
      setDeletingId(null);
    }
  };

  if (isUserLoading) return <DashboardLoading />;
  if (!user) return <div>ログインしてください</div>;

  const playlists = playlistsData?.items || [];

  return (
    <>
      <div className="playlists-page">
        <div className="page-header">
          <h1>プレイリスト管理</h1>
          <Link to="/dashboard/playlists/new" className="new-button">
            + 新規作成
          </Link>
        </div>

        {playlists.length === 0 ? (
          <div className="empty-state">
            <p>プレイリストがありません</p>
            <Link to="/dashboard/playlists/new">最初のプレイリストを作成</Link>
          </div>
        ) : (
          <div className="playlists-list">
            {playlists.map((playlist) => (
              <div key={playlist.id} className="playlist-item">
                <div className="playlist-info">
                  <h3>{playlist.title}</h3>
                  <div className="playlist-meta">
                    <span
                      className={`visibility-badge ${playlist.visibility.toLowerCase()}`}
                    >
                      {visibility2str(playlist.visibility)}
                    </span>
                    <span>{playlist.movies?.length || 0}本の動画</span>
                  </div>
                </div>
                <div className="playlist-actions">
                  <Link
                    to="/dashboard/playlists/$id/edit"
                    params={{ id: playlist.id }}
                    className="action-btn"
                  >
                    編集
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDelete(playlist.id)}
                    disabled={deletingId === playlist.id}
                    className="action-btn delete"
                  >
                    {deletingId === playlist.id ? "削除中..." : "削除"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {playlistsData?.pagination && (
          <PaginationControls
            onPageChange={setPage}
            page={page}
            totalCount={playlistsData.pagination.totalCount}
            totalPages={playlistsData.pagination.totalPages}
          />
        )}
      </div>
    </>
  );
}
