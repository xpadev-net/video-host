import { useAtom, useAtomValue } from "jotai";
import { PanelsTopLeft, RectangleHorizontal } from "lucide-react";

import { PlayerConfigAtom, PlayerStateAtom } from "@/atoms/Player";

type props = {
  className?: string;
};

const TheatreButton = ({ className }: props) => {
  const [playerConfig, setPlayerConfig] = useAtom(PlayerConfigAtom);
  const { isFullscreen } = useAtomValue(PlayerStateAtom);
  const toggleTheatre = () => {
    setPlayerConfig((pv) => ({ ...pv, isTheatre: !pv.isTheatre }));
  };

  if (isFullscreen) return null;
  return (
    <button
      className={className}
      onClick={toggleTheatre}
      type="button"
      aria-label={
        playerConfig.isTheatre ? "シアターモードを終了" : "シアターモードにする"
      }
    >
      {playerConfig.isTheatre ? (
        <RectangleHorizontal aria-hidden="true" />
      ) : (
        <PanelsTopLeft aria-hidden="true" />
      )}
    </button>
  );
};

export { TheatreButton };
