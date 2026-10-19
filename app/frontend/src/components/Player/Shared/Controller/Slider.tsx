import { useAtomValue } from "jotai";

import { VideoMetadataAtom } from "@/atoms/Player";
import { useSeekSlider } from "@/hooks/useSeekSlider";
import { cn } from "@/lib/utils";
import { time2str } from "@/libraries/time";

type Props = {
  className?: string;
  showTimePreview?: boolean;
};

export function Slider({ className, showTimePreview = false }: Props) {
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
      <div className="absolute bottom-0 h-[3px] w-full rounded-full bg-white/20" />
      {buffered.map((range) => (
        <div
          className="absolute bottom-0 h-[3px] rounded-full bg-white/80 transition-all duration-250 ease-in-out"
          key={`${range.left}-${range.width}`}
          style={{ left: `${range.left}%`, width: `${range.width}%` }}
        />
      ))}
      <div
        className="absolute bottom-0 h-[3px] rounded-full bg-accent"
        style={{ left: 0, width: `${progress}%` }}
      />
      <div
        className={cn(
          "absolute bottom-[1.5px] h-[3px] w-[3px] -translate-x-1/2 translate-y-1/2 rounded-full bg-accent transition-[width,height] duration-50 ease-in-out group-hover:h-[11px] group-hover:w-[11px]",
          isDragging && "h-[11px] w-[11px]",
        )}
        style={{ left: `${progress}%` }}
      />
      {showTimePreview && (
        <span
          className="absolute bottom-4 hidden -translate-x-1/2 text-xs text-white group-hover:block"
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
