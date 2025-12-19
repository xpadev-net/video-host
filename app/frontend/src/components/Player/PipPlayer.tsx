import { useAtomValue, useSetAtom } from "jotai";
import { useRouter } from "next/router";
import { useEffect, useRef } from "react";
import { CurrentMovieAtom, DurablePlayerAtom } from "@/atoms/Player";

const PipPlayer = () => {
  const playerPortalTargetRef = useRef<HTMLDivElement>(null);
  const setPlayerPortalTarget = useSetAtom(DurablePlayerAtom);
  const currentMovie = useAtomValue(CurrentMovieAtom);
  const router = useRouter();
  const isPipMode =
    router.pathname !== "/movies/[movie]" &&
    !router.asPath.match(/^\/movies\/[^/]+$/);

  useEffect(() => {
    if (!playerPortalTargetRef.current || !isPipMode) return;
    setPlayerPortalTarget({
      target: playerPortalTargetRef.current,
      className: "overflow-visible",
    });
    return () => {
      setPlayerPortalTarget(null);
    };
  }, [setPlayerPortalTarget, isPipMode]);

  if (!isPipMode || !currentMovie) return null;

  return (
    <div
      className={
        "fixed bottom-2 right-2 w-[540px] max-w-[25vw] rounded-lg shadow-2xl z-10000 bg-(--color-secondary-background) overflow-hidden shadow-lg"
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
