import { useAtomValue } from "jotai";
import { useRouter } from "next/router";
import { useEffect, useId, useRef } from "react";
import type { FilteredMovie } from "@/@types/v4Api";
import { CurrentMovieAtom, DurablePlayerAtom } from "@/atoms/Player";
import { useIsMobile } from "@/libraries/isMobile";
import { DesktopPlayer } from "./DesktopPlayer";
import { MobilePlayer } from "./MobilePlayer";

export const PortalPlayer = ({
  fallback,
}: {
  fallback: HTMLElement | null;
}) => {
  const portalTarget = useAtomValue(DurablePlayerAtom);
  const currentMovie = useAtomValue(CurrentMovieAtom);
  const router = useRouter();
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const target = portalTarget || fallback;

  // PiPモードの判定: パスが/movies/[movie]でない場合
  const isPipMode =
    router.pathname !== "/movies/[movie]" &&
    !router.asPath.match(/^\/movies\/[^/]+$/);

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
    console.log("no target");
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
  data: FilteredMovie;
  className?: string;
  id: string;
  isPipMode?: boolean;
};

const Player = ({ data, className, id, isPipMode = false }: props) => {
  const isMobile = useIsMobile();
  useEffect(() => {
    console.log("Player mounted", data, className);
    return () => {
      console.log("Player unmounted", data, className);
    };
  });

  if (isMobile)
    return (
      <MobilePlayer
        className={className}
        data={data}
        id={id}
        isPipMode={isPipMode}
      />
    );
  return (
    <DesktopPlayer
      className={className}
      data={data}
      id={id}
      isPipMode={isPipMode}
    />
  );
};
