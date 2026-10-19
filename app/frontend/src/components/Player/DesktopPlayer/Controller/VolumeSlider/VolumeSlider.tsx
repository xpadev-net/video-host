import { useAtomValue } from "jotai";
import {
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  PlayerMutedAtom,
  PlayerVolumeAtom,
  VideoRefAtom,
} from "@/atoms/Player";

const VolumeSlider = () => {
  const videoRef = useAtomValue(VideoRefAtom);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  // The retained level stays visible and announced while muted (the icon and
  // aria-valuetext say it is muted): the arrow keys adjust that same level, so
  // what is shown is what the next key press changes.
  const configVolume = useAtomValue(PlayerVolumeAtom);
  const muted = useAtomValue(PlayerMutedAtom);
  const [isDragging, setIsDragging] = useState(false);

  const updateVolume = useCallback(
    (clientX: number) => {
      if (!wrapperRef.current || !videoRef) return;
      const rect = wrapperRef.current.getBoundingClientRect();
      let x = clientX - rect.left;
      if (x < 0) x = 0;
      else if (x > rect.width) x = rect.width;
      videoRef.volume = x / rect.width;
      // Moving the slider is an explicit request to hear something.
      videoRef.muted = false;
    },
    [videoRef],
  );

  useEffect(() => {
    const onMouseMove = (e: globalThis.MouseEvent) => {
      if (!isDragging) return;
      updateVolume(e.clientX);
    };
    const onMouseUp = () => {
      setIsDragging(false);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isDragging, updateVolume]);
  const onMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    updateVolume(e.clientX);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!videoRef) return;

    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      const newVolume = Math.max(0, videoRef.volume - 0.05);
      videoRef.volume = newVolume;
      videoRef.muted = false;
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      const newVolume = Math.min(1, videoRef.volume + 0.05);
      videoRef.volume = newVolume;
      videoRef.muted = false;
    }
  };

  return (
    <div
      className="relative w-10 h-10 mx-1.5 cursor-pointer"
      onMouseDown={onMouseDown}
      onKeyDown={handleKeyDown}
      ref={wrapperRef}
      role="slider"
      tabIndex={0}
      aria-label="Volume slider"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(configVolume * 100)}
      aria-valuetext={muted ? "ミュート中" : undefined}
    >
      <div className="absolute top-5 -translate-y-1/2 w-full h-1 bg-white/20 rounded-full overflow-hidden">
        <div
          className={`absolute top-0 left-0 h-1 rounded-full bg-white ${muted ? "opacity-40" : ""}`}
          style={{
            width: `${configVolume * 100}%`,
          }}
        />
      </div>
      <div
        className="absolute top-5 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white"
        style={{
          left: `${configVolume * 100}%`,
        }}
      />
    </div>
  );
};

export { VolumeSlider };
