import { useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import type { FilteredMovie } from "@/@types/v4Api";
import { CurrentMovieAtom, PlayerPortalTargetAtom } from "@/atoms/Player";

type props = {
  data: FilteredMovie;
  className?: string;
};

const Player = ({ data, className }: props) => {
  const setCurrentMovie = useSetAtom(CurrentMovieAtom);
  const playerPortalTargetRef = useRef<HTMLDivElement>(null);
  const setPlayerPortalTarget = useSetAtom(PlayerPortalTargetAtom);
  useEffect(() => {
    setCurrentMovie(data);
  }, [data, setCurrentMovie]);

  useEffect(() => {
    if (!playerPortalTargetRef.current) return;
    setPlayerPortalTarget(playerPortalTargetRef.current);
    return () => {
      setPlayerPortalTarget(null);
    };
  }, [setPlayerPortalTarget]);

  return <div className={className} ref={playerPortalTargetRef} />;
};

export { Player };
