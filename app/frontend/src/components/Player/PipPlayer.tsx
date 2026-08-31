import { useRouterState } from "@tanstack/react-router";
import type { FormattedMovie } from "@video-host/backend";
import { useAtomValue, useSetAtom } from "jotai";
import { type RefObject, useEffect, useRef } from "react";
import { CurrentMovieAtom, DurablePlayerAtom } from "@/atoms/Player";
import { useIsMobile } from "@/libraries/isMobile";

const PipPlayer = () => {
  const playerPortalTargetRef = useRef<HTMLDivElement>(null);
  const setPlayerPortalTarget = useSetAtom(DurablePlayerAtom);
  const currentMovie = useAtomValue(CurrentMovieAtom);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const isPipMode = !/^\/movies\/[^/]+\/?$/.test(pathname);

  const isMobile = useIsMobile();

  useEffect(() => {
    const target = playerPortalTargetRef.current;
    if (!target || !isPipMode) return;
    setPlayerPortalTarget({
      target,
      className: "overflow-visible",
    });
    return () => {
      setPlayerPortalTarget((current) =>
        current?.target === target ? null : current,
      );
    };
  }, [setPlayerPortalTarget, isPipMode]);

  if (!isPipMode || !currentMovie) return null;

  if (isMobile) {
    return (
      <MobilePipPlayer
        playerPortalTargetRef={playerPortalTargetRef}
        currentMovie={currentMovie}
      />
    );
  }
  return (
    <DesktopPipPlayer
      playerPortalTargetRef={playerPortalTargetRef}
      currentMovie={currentMovie}
    />
  );
};

const DesktopPipPlayer = ({
  playerPortalTargetRef,
  currentMovie,
}: {
  playerPortalTargetRef: RefObject<HTMLDivElement | null>;
  currentMovie: FormattedMovie;
}) => {
  return (
    <div
      className={
        "fixed bottom-2 right-2 w-[540px] max-w-[25vw] rounded-lg shadow-2xl z-10000 bg-(--color-secondary-background) overflow-hidden"
      }
    >
      <div ref={playerPortalTargetRef} />
      <div className="px-4 py-2 text-sm text-white relative -z-10">
        <div className="truncate font-medium">{currentMovie.title}</div>
        {currentMovie.series?.title && (
          <div className="truncate text-xs text-gray-400">
            {currentMovie.series.title}
          </div>
        )}
      </div>
    </div>
  );
};

const MobilePipPlayer = ({
  playerPortalTargetRef,
  currentMovie,
}: {
  playerPortalTargetRef: RefObject<HTMLDivElement | null>;
  currentMovie: FormattedMovie;
}) => {
  return (
    <div
      className={
        "fixed bottom-16 right-2 w-[540px] max-w-[50vw] rounded-lg shadow-2xl z-10000 bg-(--color-secondary-background) overflow-hidden"
      }
    >
      <div ref={playerPortalTargetRef} />
      <div className="px-4 py-2 text-sm text-white relative -z-10">
        <div className="truncate font-medium">{currentMovie.title}</div>
        {currentMovie.series?.title && (
          <div className="truncate text-xs text-gray-400">
            {currentMovie.series.title}
          </div>
        )}
      </div>
    </div>
  );
};

export { PipPlayer };
