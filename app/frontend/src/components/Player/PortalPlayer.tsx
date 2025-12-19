import { useAtomValue } from "jotai";
import { useEffect, useId, useRef } from "react";
import type { FilteredMovie } from "@/@types/v4Api";
import { CurrentMovieAtom, PlayerPortalTargetAtom } from "@/atoms/Player";
import { useIsMobile } from "@/libraries/isMobile";
import { DesktopPlayer } from "./DesktopPlayer";
import { MobilePlayer } from "./MobilePlayer";

export const PortalPlayer = ({
  fallback,
}: {
  fallback: HTMLElement | null;
}) => {
  const portalTarget = useAtomValue(PlayerPortalTargetAtom);
  const currentMovie = useAtomValue(CurrentMovieAtom);
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const target = portalTarget || fallback;

  useEffect(() => {
    const player = document.getElementById(id);
    if (!player) return;

    if (portalTarget) {
      portalTarget.appendChild(player);
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
    <div ref={ref}>
      <Player data={currentMovie} id={id} />
    </div>
  );
};

type props = {
  data: FilteredMovie;
  className?: string;
  id: string;
};

const Player = ({ data, className, id }: props) => {
  const isMobile = useIsMobile();
  useEffect(() => {
    console.log("Player mounted", data, className);
    return () => {
      console.log("Player unmounted", data, className);
    };
  });

  if (isMobile)
    return <MobilePlayer className={className} data={data} id={id} />;
  return <DesktopPlayer className={className} data={data} id={id} />;
};
