import type { FormattedMovie } from "@video-host/backend";
import { useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import { CurrentMovieAtom, DurablePlayerAtom } from "@/atoms/Player";

type props = {
  data: FormattedMovie;
  className?: string;
};

const Player = ({ data, className }: props) => {
  const setCurrentMovie = useSetAtom(CurrentMovieAtom);
  const playerPortalTargetRef = useRef<HTMLDivElement>(null);
  const setPlayerPortalTarget = useSetAtom(DurablePlayerAtom);
  useEffect(() => {
    setCurrentMovie(data);
  }, [data, setCurrentMovie]);

  useEffect(() => {
    if (!playerPortalTargetRef.current) return;
    setPlayerPortalTarget({ target: playerPortalTargetRef.current, className });
    return () => {
      setPlayerPortalTarget(null);
    };
  }, [setPlayerPortalTarget, className]);

  return <div className={className} ref={playerPortalTargetRef} />;
};

export { Player };
