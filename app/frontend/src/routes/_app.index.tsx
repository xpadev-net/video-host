import { createFileRoute } from "@tanstack/react-router";
import { type CSSProperties, useEffect, useMemo, useRef } from "react";

import { MovieCard, MovieCardSkeleton } from "@/components/Movie";
import { SiteName } from "@/contexts/env";
import { useMovies } from "@/hooks/useMovies";
import { useWindowWidth } from "@/hooks/useWindowWidth";
import { elementIsVisibleInViewport } from "@/libraries/elementIsVisibleInViewport";

export const Route = createFileRoute("/_app/")({
  head: () => ({
    meta: [
      { title: SiteName },
      { name: "description", content: "Japanese home media server frontend" },
    ],
    links: [{ rel: "icon", href: "/favicon.ico" }],
  }),
  component: IndexRoute,
});

function IndexRoute() {
  const { movies, setSize, hasNext, isValidating } = useMovies();

  const wrapper = useRef<HTMLDivElement | null>(null);
  const containerWidth = useWindowWidth(wrapper);

  const width = useMemo(() => {
    const cardCount = Math.floor(containerWidth / 380) + 1;
    return containerWidth / cardCount - 4;
  }, [containerWidth]);

  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!loadMoreRef.current || !hasNext) return;
    const io = new window.IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasNext && !isValidating) {
        void setSize((size) => size + 1);
      }
    });
    io.observe(loadMoreRef.current);
    if (elementIsVisibleInViewport(loadMoreRef.current) && !isValidating) {
      void setSize((size) => size + 1);
    }
    return () => io.disconnect();
  }, [hasNext, isValidating, setSize]);

  return (
    <div className="p-4">
      <div
        ref={wrapper}
        style={{ "--width": `${width}px` } as CSSProperties}
        className="grid gap-0.5 grid-cols-[repeat(auto-fill,_var(--width))]"
      >
        {movies.map((movie) => (
          <MovieCard
            key={movie.id}
            movie={movie}
            type="row"
            showSeries={true}
          />
        ))}
        {hasNext && (
          <>
            <MovieCardSkeleton ref={loadMoreRef} type="row" />
            {Array.from({ length: 50 }).map((_, i) => (
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
      {!hasNext && (
        <div style={{ textAlign: "center", color: "#888" }}>
          これ以上データはありません
        </div>
      )}
    </div>
  );
}
