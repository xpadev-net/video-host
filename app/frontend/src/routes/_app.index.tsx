import { createFileRoute } from "@tanstack/react-router";
import { LoadErrorMessage } from "@/components/LoadErrorMessage";
import { MovieCard, MovieCardSkeleton } from "@/components/Movie";
import { SiteName } from "@/contexts/env";
import { useInfiniteScrolling } from "@/hooks/useInfiniteScrolling";
import { useMovies } from "@/hooks/useMovies";

export const Route = createFileRoute("/_app/")({
  head: () => ({
    meta: [{ title: SiteName }],
  }),
  component: IndexRoute,
});

function IndexRoute() {
  const { movies, setSize, hasNext, isValidating, error, mutate } = useMovies();
  const { loadMoreRef } = useInfiniteScrolling({
    hasNext,
    isValidating,
    setSize,
  });

  return (
    <div className="p-4">
      <div className="grid gap-0.5 grid-cols-[repeat(auto-fill,_minmax(min(100%,_280px),_1fr))]">
        {movies.map((movie) => (
          <MovieCard
            key={movie.id}
            movie={movie}
            type="row"
            showSeries={true}
          />
        ))}
        {hasNext && !error && (
          <>
            <MovieCardSkeleton ref={loadMoreRef} type="row" />
            {Array.from({ length: 8 }).map((_, i) => (
              <MovieCardSkeleton
                key={`skeleton-${
                  // biome-ignore lint/suspicious/noArrayIndexKey: skeletons have no stable identity
                  i
                }`}
                type="row"
              />
            ))}
          </>
        )}
      </div>
      {error ? (
        <LoadErrorMessage
          message="動画を読み込めませんでした"
          onRetry={() => void mutate()}
        />
      ) : null}
      {!hasNext && !error && (
        <div className="text-center text-[var(--color-sub-text)]">
          これ以上データはありません
        </div>
      )}
    </div>
  );
}
