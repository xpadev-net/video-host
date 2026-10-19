import { useNavigate } from "@tanstack/react-router";
import type { FormattedMovie } from "@video-host/backend";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { type FC, useEffect, useRef } from "react";
import {
  PlayerConfigAtom,
  PlayerPlaybackRateAtom,
  PlayerPlayPauseNotificationAtom,
  PlayerSeekNotificationAtom,
  PlayerStateAtom,
  VideoRefAtom,
} from "@/atoms/Player";
import { PLAYBACK_RATES, SEEK_SECONDS } from "@/components/Player/constants";
import { findNext, findPrev } from "@/components/Player/utils/findPrevNext";
import { shouldIgnoreShortcut } from "@/components/Player/utils/shortcuts";

// How long the seek / play-pause indicators stay on screen.
const NOTIFICATION_MS = 100;

type Props = {
  data: FormattedMovie;
};

const KeyboardHandler: FC<Props> = ({ data }) => {
  const videoRef = useAtomValue(VideoRefAtom);
  const [_playerConfig, setPlayerConfig] = useAtom(PlayerConfigAtom);
  const setPlaybackRate = useSetAtom(PlayerPlaybackRateAtom);
  const [playerState, setVideoMetadata] = useAtom(PlayerStateAtom);
  const setSeekNotification = useSetAtom(PlayerSeekNotificationAtom);
  const setPlayPauseNotification = useSetAtom(PlayerPlayPauseNotificationAtom);
  const navigate = useNavigate();

  // Read by the key handler without re-registering it on every state change.
  const isFullscreenRef = useRef(playerState.isFullscreen);
  isFullscreenRef.current = playerState.isFullscreen;

  // One timer per indicator: a new notification replaces the pending clear of
  // the previous one instead of being wiped by it, and nothing fires after
  // unmount.
  const seekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playPauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (seekTimerRef.current) clearTimeout(seekTimerRef.current);
      if (playPauseTimerRef.current) clearTimeout(playPauseTimerRef.current);
      // The timers were the only thing resetting these global indicators, so
      // reset them too or a later player would show a stale one.
      setSeekNotification(null);
      setPlayPauseNotification(null);
    },
    [setSeekNotification, setPlayPauseNotification],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!videoRef || !data) return false;
      if (shouldIgnoreShortcut(e)) return false;
      if (e.code === "ArrowRight" || e.code === "ArrowLeft") {
        e.preventDefault();
        const seekSeconds = SEEK_SECONDS;
        const direction = e.code === "ArrowRight" ? "forward" : "backward";
        videoRef.currentTime +=
          seekSeconds * (direction === "forward" ? 1 : -1);
        setSeekNotification({ direction, seconds: seekSeconds });
        if (seekTimerRef.current) clearTimeout(seekTimerRef.current);
        seekTimerRef.current = setTimeout(
          () => setSeekNotification(null),
          NOTIFICATION_MS,
        );
        return true;
      }
      if (e.code === "ArrowUp" || e.code === "ArrowDown") {
        e.preventDefault();
        const volume = videoRef.volume + 0.1 * (e.code === "ArrowUp" ? 1 : -1);
        videoRef.volume = Math.min(1, Math.max(0, volume));
        return true;
      }
      if ((e.code === "Period" || e.code === "Comma") && e.shiftKey) {
        e.preventDefault();
        setPlaybackRate((prev) => {
          const key =
            PLAYBACK_RATES.indexOf(prev) + (e.code === "Period" ? 1 : -1);
          if (!PLAYBACK_RATES[key]) return prev;
          videoRef.playbackRate = PLAYBACK_RATES[key];
          return PLAYBACK_RATES[key];
        });
        return true;
      }
      if (e.code === "Space" || e.code === "KeyK") {
        e.preventDefault();
        const action = videoRef.paused ? "play" : "pause";
        void (videoRef.paused ? videoRef.play() : videoRef.pause());
        setPlayPauseNotification({ action });
        if (playPauseTimerRef.current) clearTimeout(playPauseTimerRef.current);
        playPauseTimerRef.current = setTimeout(
          () => setPlayPauseNotification(null),
          NOTIFICATION_MS,
        );
        return true;
      }
      if ((e.code === "KeyN" || e.code === "KeyP") && e.shiftKey) {
        e.preventDefault();
        const item = e.code === "KeyN" ? findNext(data) : findPrev(data);
        if (!item) return false;
        void navigate({ to: "/movies/$movie", params: { movie: item.id } });
        return true;
      }
      if (e.code === "KeyT") {
        e.preventDefault();
        setPlayerConfig((prev) => ({ ...prev, isTheatre: !prev.isTheatre }));
        return true;
      }
      // Escape only belongs to the player while it is fullscreen; otherwise
      // leave it to menus, dialogs and the browser.
      if (e.code === "Escape" && !isFullscreenRef.current) return false;
      if (e.code === "KeyF" || e.code === "Escape") {
        e.preventDefault();
        setVideoMetadata((prev) => ({
          ...prev,
          isFullscreen: e.code === "KeyF" ? !prev.isFullscreen : false,
        }));
        return true;
      }
      return false;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const result = handler(e);
      if (result) {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    videoRef,
    data,
    setPlaybackRate,
    setPlayerConfig,
    setVideoMetadata,
    setSeekNotification,
    setPlayPauseNotification,
    navigate,
  ]);

  return null;
};

export { KeyboardHandler };
