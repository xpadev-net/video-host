import { useRouterState } from "@tanstack/react-router";
import type { FormattedMovie } from "@video-host/backend";
import { useAtomValue } from "jotai";
import { useEffect, useId, useRef, useState } from "react";
import { CurrentMovieAtom, DurablePlayerAtom } from "@/atoms/Player";
import { isPipRoute } from "@/components/Player/utils/isPipRoute";
import { DesktopPlayer } from "./DesktopPlayer";
import { MobilePlayer } from "./MobilePlayer";

export const PortalPlayer = ({
  fallback,
}: {
  fallback: HTMLElement | null;
}) => {
  const portalTarget = useAtomValue(DurablePlayerAtom);
  const currentMovie = useAtomValue(CurrentMovieAtom);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const target = portalTarget || fallback;

  // PiPモードの判定: パスが/movies/[movie]でない場合
  const isPipMode = isPipRoute(pathname);

  useEffect(() => {
    const player = document.getElementById(id);
    if (!player) return;

    if (portalTarget) {
      player.parentElement?.removeChild(player);
      portalTarget.target?.appendChild(player);
    }

    return () => {
      ref.current?.appendChild(player);
    };
  }, [portalTarget, id]);

  if (!target || !currentMovie) {
    return null;
  }

  return (
    <div ref={ref} className={"hidden"}>
      <Player
        data={currentMovie}
        id={id}
        isPipMode={isPipMode}
        className={portalTarget?.className}
      />
    </div>
  );
};

type props = {
  data: FormattedMovie;
  className?: string;
  id: string;
  isPipMode?: boolean;
};

const Player = ({ data, className, id, isPipMode = false }: props) => {
  const [playerMode, setPlayerMode] = useState<boolean | null>(null);

  useEffect(() => {
    setPlayerMode(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  return (
    <div id={id}>
      {playerMode === true && (
        <MobilePlayer
          className={className}
          data={data}
          id={id}
          isPipMode={isPipMode}
        />
      )}
      {playerMode === false && (
        <DesktopPlayer
          className={className}
          data={data}
          id={id}
          isPipMode={isPipMode}
        />
      )}
    </div>
  );
};
