import { useAtomValue } from "jotai";

import { VideoMetadataAtom } from "@/atoms/Player";
import { useSeekSlider } from "@/hooks/useSeekSlider";
import { cn } from "@/lib/utils";
import { time2str } from "@/libraries/time";

type Props = {
  className?: string;
  centered?: boolean;
  showTimePreview?: boolean;
};

export function Slider({
  className,
  centered = false,
  showTimePreview = false,
}: Props) {
  const metadata = useAtomValue(VideoMetadataAtom);
  const {
    trackRef,
    buffered,
    progress,
    previewProgress,
    isDragging,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  } = useSeekSlider();

  return (
    <button
      aria-label="シーク"
      className={cn(
        "relative h-4 w-full cursor-pointer touch-none group",
        className,
      )}
      ref={trackRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClick={(event) => event.stopPropagation()}
      type="button"
    >
      <div
        className={cn(
          "absolute h-[3px] w-full rounded-full bg-white/20",
          centered ? "top-1/2 -translate-y-1/2" : "bottom-0",
        )}
      />
      {buffered.map((range) => (
        <div
          className={cn(
            "absolute h-[3px] rounded-full bg-white/80 transition-all duration-250 ease-in-out",
            centered ? "top-1/2 -translate-y-1/2" : "bottom-0",
          )}
          key={`${range.left}-${range.width}`}
          style={{ left: `${range.left}%`, width: `${range.width}%` }}
        />
      ))}
      <div
        className={cn(
          "absolute h-[3px] rounded-full bg-accent",
          centered ? "top-1/2 -translate-y-1/2" : "bottom-0",
        )}
        style={{ left: 0, width: `${progress}%` }}
      />
      <div
        className={cn(
          "absolute h-[3px] w-[3px] -translate-x-1/2 rounded-full bg-accent transition-[width,height] duration-50 ease-in-out group-hover:h-[11px] group-hover:w-[11px]",
          centered
            ? "top-1/2 h-3 w-3 -translate-y-1/2"
            : "bottom-[1.5px] translate-y-1/2",
          isDragging && "h-[11px] w-[11px]",
        )}
        style={{ left: `${progress}%` }}
      />
      {showTimePreview && (
        <span
          className={cn(
            "absolute hidden -translate-x-1/2 text-xs text-white group-hover:block",
            centered ? "top-0" : "bottom-4",
          )}
          style={{
            left: `max(min(${previewProgress}%, calc(100% - 15px)), 15px)`,
          }}
        >
          {time2str((previewProgress / 100) * metadata.duration)}
        </span>
      )}
    </button>
  );
}
