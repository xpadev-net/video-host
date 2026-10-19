import { useAtomValue } from "jotai";
import { Pause, Play } from "lucide-react";
import type { MouseEvent } from "react";

import { PlayerStateAtom, VideoRefAtom } from "@/atoms/Player";

type props = {
  className?: string;
};

const PlayPauseButton = ({ className }: props) => {
  const videoRef = useAtomValue(VideoRefAtom);
  const { paused } = useAtomValue(PlayerStateAtom);
  const togglePlayerState = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (videoRef?.paused) {
      void videoRef?.play();
    } else {
      videoRef?.pause();
    }
  };

  return (
    <button
      type="button"
      onClick={togglePlayerState}
      className={className}
      aria-label={paused ? "動画を再生" : "動画を一時停止"}
    >
      {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
    </button>
  );
};

export { PlayPauseButton };
