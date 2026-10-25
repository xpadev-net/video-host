import { useAtomValue } from "jotai";

import { VideoMetadataAtom } from "@/atoms/Player";
import { cn } from "@/lib/utils";
import { time2str } from "@/libraries/time";

export function TimeDisplay({ compact = false }: { compact?: boolean }) {
  const { currentTime, duration } = useAtomValue(VideoMetadataAtom);

  return (
    <div
      className={cn("text-xs", compact && "w-24 text-center whitespace-nowrap")}
    >
      <span
        className={cn("text-gray-300 mx-0.5", compact && "leading-10 px-0.5")}
      >
        {time2str(currentTime)}
      </span>
      <span
        className={cn("text-gray-300 mx-0.5", compact && "leading-10 px-0.5")}
      >
        /
      </span>
      <span
        className={cn("text-gray-300 mx-0.5", compact && "leading-10 px-0.5")}
      >
        {time2str(duration)}
      </span>
    </div>
  );
}
