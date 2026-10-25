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
    onKeyDown,
  } = useSeekSlider();

  return (
    <div
      role="slider"
      aria-label="シーク"
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Number.isFinite(progress) ? Math.round(progress) : 0}
      aria-valuetext={`${time2str((progress / 100) * metadata.duration)} / ${time2str(metadata.duration)}`}
      tabIndex={0}
      className={cn(
        "relative h-4 w-full cursor-pointer touch-none group focus-visible:outline focus-visible:outline-2 focus-visible:outline-white",
        className,
      )}
      ref={trackRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={onKeyDown}
      onClick={(event) => event.stopPropagation()}
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
          key={range.id}
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
    </div>
  );
}
