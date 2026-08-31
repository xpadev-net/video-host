import { createFileRoute, Link } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { useState } from "react";
import { AuthTokenAtom } from "@/atoms/Auth";
import { useMyPlaylists } from "@/hooks/useDashboard";
import { useSelf } from "@/hooks/useUser";
import { client } from "@/lib/client";

export const Route = createFileRoute("/_app/dashboard/playlists/")({
  head: () => ({ meta: [{ title: "プレイリスト管理" }] }),
  component: PlaylistsPage,
});

function PlaylistsPage() {
  const token = useAtomValue(AuthTokenAtom);
  const { data: user, isLoading: isUserLoading } = useSelf();
  const { data: playlistsData, mutate } = useMyPlaylists();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm("このプレイリストを削除しますか？")) return;
    setDeletingId(id);
    try {
      const res = await client.api.v4.playlists[":playlist"].$delete(
        {
          param: { playlist: id },
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!res.ok) {
        throw new Error("Failed to delete");
      }

      mutate();
    } catch {
      alert("削除に失敗しました");
    } finally {
      setDeletingId(null);
    }
  };

  if (isUserLoading) return <div>Loading...</div>;
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
            {playlists.map(
              (playlist: {
                id: string;
                title: string;
                visibility: string;
                movies?: unknown[];
              }) => (
                <div key={playlist.id} className="playlist-item">
                  <div className="playlist-info">
                    <h3>{playlist.title}</h3>
                    <div className="playlist-meta">
                      <span
                        className={`visibility-badge ${playlist.visibility.toLowerCase()}`}
                      >
                        {playlist.visibility === "PUBLIC"
                          ? "公開"
                          : playlist.visibility === "UNLISTED"
                            ? "限定公開"
                            : "非公開"}
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
              ),
            )}
          </div>
        )}
      </div>
      <style>{`
        .playlists-page h1 { color: var(--text-primary, #fff); }
        .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }
        .new-button { padding: 0.75rem 1.25rem; background: var(--primary-color, #3b82f6); color: white; text-decoration: none; border-radius: 8px; }
        .empty-state { text-align: center; padding: 4rem; color: var(--text-secondary, #999); }
        .empty-state a { color: var(--primary-color, #3b82f6); }
        .playlists-list { display: flex; flex-direction: column; gap: 1rem; }
        .playlist-item { display: flex; align-items: center; justify-content: space-between; padding: 1rem; background: var(--background-primary, #0d0d0d); border: 1px solid var(--border-color, #333); border-radius: 12px; }
        .playlist-info h3 { color: var(--text-primary, #fff); margin: 0 0 0.5rem; }
        .playlist-meta { display: flex; align-items: center; gap: 0.75rem; color: var(--text-secondary, #999); font-size: 0.875rem; }
        .visibility-badge { padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; }
        .visibility-badge.public { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
        .visibility-badge.unlisted { background: rgba(234, 179, 8, 0.2); color: #eab308; }
        .visibility-badge.private { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
        .playlist-actions { display: flex; gap: 0.5rem; }
        .action-btn { padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.875rem; text-decoration: none; cursor: pointer; border: 1px solid var(--border-color, #333); background: transparent; color: var(--text-primary, #fff); }
        .action-btn.delete { color: #ef4444; border-color: #ef4444; }
        .action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </>
  );
}
