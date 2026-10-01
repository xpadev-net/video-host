import { createFileRoute } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";

import { PlayerConfigAtom, WrapperRefAtom } from "@/atoms/Player";
import { MovieInfo } from "@/components/MovieInfo";
import { MoviePageSkeleton } from "@/components/MoviePageSkeleton";
import { Player } from "@/components/Player";
import { PlayList } from "@/components/PlayList";
import { SiteName } from "@/contexts/env";
import { useMovie } from "@/hooks/useMovie";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/libraries/isMobile";

export const Route = createFileRoute("/_app/movies/$movie")({
  head: () => ({ meta: [{ title: SiteName }] }),
  component: MovieRoute,
});

function MovieRoute() {
  const { movie } = Route.useParams();
  const data = useMovie(movie);

  const { isTheatre } = useAtomValue(PlayerConfigAtom);
  const wrapperRef = useAtomValue(WrapperRefAtom);
  const [playlistMaxHeight, setPlaylistMaxHeight] = useState<
    number | undefined
  >();
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!wrapperRef) return;
    const resizeObserver = new ResizeObserver((entries) => {
      const wrapper = entries[0];
      if (!wrapper) return;
      setPlaylistMaxHeight(wrapper.contentRect.height);
    });
    resizeObserver.observe(wrapperRef);
    return () => resizeObserver.disconnect();
  }, [wrapperRef]);

  useEffect(() => {
    if (data.data?.status === "ok") {
      const previousTitle = document.title;
      const movieTitle = `${data.data.data.title} / ${data.data.data.series?.title} - ${SiteName}`;
      document.title = movieTitle;

      return () => {
        if (document.title === movieTitle) {
          document.title = previousTitle;
        }
      };
    }
  }, [data.data]);

  if (!data.data) return <MoviePageSkeleton />;
  if (data.data.status !== "ok") {
    return (
      <div>
        <h2>見つかりませんでした</h2>
      </div>
    );
  }

  return (
    <div className={cn("p-6 max-w-[1800px] mx-auto", isTheatre && "pt-0")}>
      <div
        className={cn(
          "grid grid-cols-[1fr_minmax(300px,400px)] gap-6 max-[1000px]:grid-cols-1",
          isMobile &&
            "landscape:grid-cols-[1fr_minmax(200px,300px)] landscape:gap-0",
        )}
      >
        <div
          className={cn(
            "player-wrapper min-w-[640px] max-[1000px]:min-w-0 aspect-video",
            isTheatre &&
              "col-span-2 -mx-6 w-screen relative left-[calc(max((100vw-1800px),0px)/-2)]",
            isMobile && "max-[1000px]:-mx-6",
            isMobile && "landscape:m-0 landscape:p-0 landscape:min-w-[500px]",
          )}
        >
          <Player data={data.data.data} />
        </div>
        <MovieInfo
          className={cn(
            "metadata",
            isTheatre && "min-w-[640px]",
            isMobile && "landscape:p-6",
          )}
          data={data.data.data}
        />
        <div
          className={cn(
            "playlist-wrapper",
            isTheatre
              ? "col-start-2 row-start-2 row-span-1"
              : "col-start-2 row-start-1 row-span-2",
            "max-[1000px]:col-auto max-[1000px]:row-auto",
          )}
        >
          <PlayList
            className={cn(
              "playlist max-[1000px]:!max-h-none",
              isMobile && "landscape:max-h-[calc(100dvh-104px)]",
            )}
            data={data.data.data}
            maxHeight={playlistMaxHeight}
          />
        </div>
      </div>
    </div>
  );
}
