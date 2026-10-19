import { useRouterState } from "@tanstack/react-router";
import type { FormattedMovie } from "@video-host/backend";
import { useAtomValue } from "jotai";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CurrentMovieAtom, DurablePlayerAtom } from "@/atoms/Player";
import { isPipRoute } from "@/components/Player/utils/isPipRoute";
import { DesktopPlayer } from "./DesktopPlayer";
import { MobilePlayer } from "./MobilePlayer";

// The player (and its HLS instance) must survive navigations: while a route is
// loading there is briefly no portal target, and a plain `createPortal` into a
// changing container would remount it. So the player always renders into one
// stable `host` element, and only that element is re-parented between the
// current target and a hidden holder. The holder is rendered by React, so the
// player is never left without a home (and never destroyed) between targets.
export const PortalPlayer = () => {
  const portalTarget = useAtomValue(DurablePlayerAtom);
  const currentMovie = useAtomValue(CurrentMovieAtom);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const id = useId();
  const holderRef = useRef<HTMLDivElement>(null);
  const [host] = useState<HTMLDivElement | null>(() =>
    typeof document === "undefined" ? null : document.createElement("div"),
  );
  const destination = portalTarget?.target ?? null;

  // PiPモードの判定: パスが/movies/[movie]でない場合
  const isPipMode = isPipRoute(pathname);

  useEffect(() => {
    const parent = destination ?? holderRef.current;
    if (host && parent && host.parentElement !== parent) {
      parent.appendChild(host);
    }
  }, [host, destination]);

  useEffect(
    () => () => {
      host?.remove();
    },
    [host],
  );

  return (
    <>
      <div ref={holderRef} className="hidden" />
      {host &&
        currentMovie &&
        createPortal(
          <Player
            data={currentMovie}
            id={id}
            isPipMode={isPipMode}
            className={portalTarget?.className}
          />,
          host,
        )}
    </>
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
