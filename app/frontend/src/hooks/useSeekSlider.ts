import { useAtomValue } from "jotai";
import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { VideoRefAtom } from "@/atoms/Player";

type BufferedRange = { id: number; left: number; width: number };

export function useSeekSlider() {
  const video = useAtomValue(VideoRefAtom);
  const trackRef = useRef<HTMLDivElement | null>(null);
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

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
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

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const nextProgress = getProgress(event.clientX);
    if (nextProgress === null) return;
    setPreviewProgress(nextProgress);
    if (isDragging) setProgress(nextProgress);
  };

  const finishDragging = (event: PointerEvent<HTMLDivElement>) => {
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

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const isSliderKey = [
      "ArrowLeft",
      "ArrowDown",
      "ArrowRight",
      "ArrowUp",
      "Home",
      "End",
    ].includes(event.key);
    if (!isSliderKey) return;
    event.preventDefault();
    event.stopPropagation();
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0)
      return;
    const step = event.shiftKey ? 10 : 5;
    let nextTime: number | null = null;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown")
      nextTime = video.currentTime - step;
    if (event.key === "ArrowRight" || event.key === "ArrowUp")
      nextTime = video.currentTime + step;
    if (event.key === "Home") nextTime = 0;
    if (event.key === "End") nextTime = video.duration;
    if (nextTime === null) return;
    video.currentTime = Math.max(0, Math.min(video.duration, nextTime));
    const nextProgress = (video.currentTime / video.duration) * 100;
    setProgress(nextProgress);
    setPreviewProgress(nextProgress);
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
          id: i,
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
      if (!Number.isFinite(video.currentTime)) {
        setProgress(0);
        return;
      }
      setProgress(
        Math.max(0, Math.min(100, (video.currentTime / video.duration) * 100)),
      );
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
    onKeyDown,
  };
}
