import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { BasicVisibility, FormattedMovie } from "@video-host/backend";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { DashboardLoading } from "@/components/Dashboard/DashboardLoading";
import { MovieManager } from "@/components/Dashboard/MovieManager";
import { useProfileSelectionGeneration } from "@/hooks/useProfileSelectionGeneration";
import { authClient } from "@/lib/auth-client";
import { client } from "@/lib/client";

export const Route = createFileRoute("/_app/dashboard/playlists/$id/edit")({
  head: () => ({ meta: [{ title: "プレイリストを編集" }] }),
  component: EditPlaylistPage,
});

interface PlaylistMovie {
  movie: Pick<FormattedMovie, "id" | "title" | "thumbnailUrl">;
  order: number;
}

function EditPlaylistPage() {
  const navigate = useNavigate();
  const { id } = Route.useParams();
  const { data: authSession, isPending: sessionPending } =
    authClient.useSession();
  const session = authSession?.user.id;
  const fetchGenerationRef = useRef(0);
  const submissionIdRef = useRef(0);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<BasicVisibility>("PUBLIC");
  const [movies, setMovies] = useState<PlaylistMovie[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const { selectedProfileId, generationRef: selectionGenerationRef } =
    useProfileSelectionGeneration(() => {
      setIsSubmitting(false);
      setError(null);
    });

  useEffect(() => {
    const generation = ++fetchGenerationRef.current;
    setIsLoading(true);
    setLoadError(null);
    if (sessionPending) return;
    if (!session) {
      setLoadError("ログイン状態を確認できませんでした");
      setIsLoading(false);
      return;
    }
    const fetchPlaylist = async () => {
      try {
        const res = await client.api.v4.playlists[":playlist"].$get(
          {
            param: { playlist: id },
          },
          { headers: { "X-Profile-Id": selectedProfileId ?? "" } },
        );

        if (Number(res.status) === 404) throw new Error("not-found");
        if (!res.ok) throw new Error("Failed to fetch");

        const json = await res.json();
        if (generation !== fetchGenerationRef.current) return;
        const data = json.data;
        setTitle(data.title);
        setDescription(data.description || "");
        setVisibility(data.visibility as BasicVisibility);
        const playlistMovies: PlaylistMovie[] = (data.movies ?? []).map(
          (movie, index) => ({ movie, order: index + 1 }),
        );
        setMovies(playlistMovies);
      } catch (cause) {
        if (generation !== fetchGenerationRef.current) return;
        setLoadError(
          cause instanceof Error && cause.message === "not-found"
            ? "プレイリストが見つかりません"
            : "プレイリストの取得に失敗しました",
        );
      } finally {
        if (generation === fetchGenerationRef.current) setIsLoading(false);
      }
    };
    void fetchPlaylist();
    return () => {
      fetchGenerationRef.current += 1;
    };
  }, [id, session, sessionPending, selectedProfileId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    setError(null);
    const selectionGeneration = selectionGenerationRef.current;
    const submissionId = ++submissionIdRef.current;

    try {
      const res = await client.api.v4.playlists[":playlist"].$patch(
        {
          param: { playlist: id },
          json: {
            title: title.trim(),
            description: description.trim(),
            visibility,
          },
        },
        { headers: { "X-Profile-Id": selectedProfileId ?? "" } },
      );

      if (!res.ok) throw new Error("Failed to update");

      if (selectionGenerationRef.current === selectionGeneration)
        await navigate({ to: "/dashboard/playlists" });
    } catch (err) {
      if (selectionGenerationRef.current === selectionGeneration)
        setError(err instanceof Error ? err.message : "更新に失敗しました");
    } finally {
      if (submissionIdRef.current === submissionId) setIsSubmitting(false);
    }
  };

  if (isLoading) return <DashboardLoading />;
  if (loadError) {
    return (
      <section className="space-y-4" role="alert">
        <p>{loadError}</p>
        <Link className="text-primary underline" to="/dashboard/playlists">
          プレイリスト一覧へ戻る
        </Link>
      </section>
    );
  }

  return (
    <>
      <div className="edit-playlist-page">
        <h1>プレイリストを編集</h1>
        <form onSubmit={handleSubmit} className="form">
          <div className="form-group">
            <label htmlFor="title">タイトル</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="description">説明</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>
          <div className="form-group">
            <label htmlFor="visibility">公開設定</label>
            <select
              id="visibility"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as BasicVisibility)}
            >
              <option value="PUBLIC">公開</option>
              <option value="UNLISTED">限定公開</option>
              <option value="PRIVATE">非公開</option>
            </select>
          </div>

          <MovieManager
            entityType="playlist"
            entityId={id}
            movies={movies}
            onMoviesChange={setMovies}
          />

          {error && <div className="error-message">{error}</div>}
          <div className="form-actions">
            <button
              type="button"
              onClick={() => void navigate({ to: "/dashboard/playlists" })}
              className="cancel-button"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={!title.trim() || isSubmitting}
              className="submit-button"
            >
              {isSubmitting ? "保存中..." : "保存"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
