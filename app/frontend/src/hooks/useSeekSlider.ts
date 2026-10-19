import { useAtomValue } from "jotai";
import {
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { VideoRefAtom } from "@/atoms/Player";

type BufferedRange = { left: number; width: number };

export function useSeekSlider() {
  const video = useAtomValue(VideoRefAtom);
  const trackRef = useRef<HTMLButtonElement | null>(null);
  const [buffered, setBuffered] = useState<BufferedRange[]>([]);
  const [progress, setProgress] = useState(0);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const getProgress = useCallback((clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    return Math.max(
      0,
      Math.min(100, ((clientX - rect.left) / rect.width) * 100),
    );
  }, []);

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0)
      return;
    event.preventDefault();
    const nextProgress = getProgress(event.clientX);
    if (nextProgress === null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
    setProgress(nextProgress);
    setPreviewProgress(nextProgress);
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const nextProgress = getProgress(event.clientX);
    if (nextProgress === null) return;
    setPreviewProgress(nextProgress);
    if (isDragging) setProgress(nextProgress);
  };

  const finishDragging = (event: PointerEvent<HTMLButtonElement>) => {
    if (!isDragging) return;
    const nextProgress = getProgress(event.clientX);
    if (video && nextProgress !== null && Number.isFinite(video.duration)) {
      video.currentTime = (video.duration * nextProgress) / 100;
      setProgress(nextProgress);
    }
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  useEffect(() => {
    if (!video) {
      setBuffered([]);
      setProgress(0);
      return;
    }

    const updateBuffered = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        setBuffered([]);
        return;
      }
      const ranges: BufferedRange[] = [];
      for (let i = 0; i < video.buffered.length; i += 1) {
        ranges.push({
          left: (video.buffered.start(i) / video.duration) * 100,
          width:
            ((video.buffered.end(i) - video.buffered.start(i)) /
              video.duration) *
            100,
        });
      }
      setBuffered(ranges);
    };
    const updateProgress = () => {
      if (isDragging || !Number.isFinite(video.duration) || video.duration <= 0)
        return;
      setProgress((video.currentTime / video.duration) * 100);
    };

    video.addEventListener("progress", updateBuffered);
    video.addEventListener("timeupdate", updateProgress);
    updateBuffered();
    updateProgress();
    return () => {
      video.removeEventListener("progress", updateBuffered);
      video.removeEventListener("timeupdate", updateProgress);
    };
  }, [video, isDragging]);

  return {
    trackRef,
    buffered,
    progress,
    previewProgress,
    isDragging,
    onPointerDown,
    onPointerMove,
    onPointerUp: finishDragging,
    onPointerCancel: () => setIsDragging(false),
  };
}
