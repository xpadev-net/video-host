import { useNavigate } from "@tanstack/react-router";
import type { FormattedMovie } from "@video-host/backend";
import Hls from "hls.js";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AudioTrackIdAtom,
  AudioTracksAtom,
  HlsRefAtom,
  PlayerConfigAtom,
  PlayerPlaybackRateAtom,
  PlayerStateAtom,
  PlayerVolumeAtom,
  VideoMetadataAtom,
} from "@/atoms/Player";
import {
  MAX_WATCHED_HISTORY_ENTRIES,
  watchedHistoryAtom,
} from "@/atoms/WatchedHistory";
import { findNext } from "@/components/Player/utils/findPrevNext";
import { isApiUrl } from "@/lib/api-origin";

type props = {
  className?: string;
  movie?: FormattedMovie;
  videoRef: RefObject<HTMLVideoElement | null>;
};

const Video = ({ className, videoRef, movie }: props) => {
  const setMetadata = useSetAtom(VideoMetadataAtom);
  const setState = useSetAtom(PlayerStateAtom);
  const [playerConfig, setPlayerConfig] = useAtom(PlayerConfigAtom);
  const playbackRate = useAtomValue(PlayerPlaybackRateAtom);
  const [configVolume, setConfigVolume] = useAtom(PlayerVolumeAtom);
  const setWatchedHistory = useSetAtom(watchedHistoryAtom);
  const setHls = useSetAtom(HlsRefAtom);
  const setAudioTracks = useSetAtom(AudioTracksAtom);
  const setAudioTrackId = useSetAtom(AudioTrackIdAtom);
  const [url, setUrl] = useState<string>("");

  const hlsRef = useRef<Hls | null>(null);
  const lastHistorySaveRef = useRef({ at: 0, movieId: "", watched: -1 });
  const selectedAudioTrackRef = useRef(-1);

  const navigate = useNavigate();

  const saveWatchedProgress = useCallback(
    (force = false) => {
      const video = videoRef.current;
      if (
        !movie ||
        !video ||
        !Number.isFinite(video.duration) ||
        video.duration <= 0 ||
        !Number.isFinite(video.currentTime)
      ) {
        return;
      }

      const now = Date.now();
      if (!force && now - lastHistorySaveRef.current.at < 5000) return;
      const watched = Math.max(
        0,
        Math.min(1, video.currentTime / video.duration),
      );
      const lastSaved = lastHistorySaveRef.current;
      if (lastSaved.movieId === movie.id && lastSaved.watched === watched)
        return;

      lastHistorySaveRef.current = { at: now, movieId: movie.id, watched };
      const entry = {
        movieId: movie.id,
        title: movie.title,
        thumbnailUrl: movie.thumbnailUrl ?? null,
        duration: video.duration,
        watched,
        updatedAt: now,
      };

      setWatchedHistory((previous) => {
        const next = { ...previous, [movie.id]: entry };
        const recentEntries = Object.values(next)
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, MAX_WATCHED_HISTORY_ENTRIES);
        return Object.fromEntries(
          recentEntries.map((historyEntry) => [
            historyEntry.movieId,
            historyEntry,
          ]),
        );
      });
    },
    [movie, setWatchedHistory, videoRef],
  );

  useEffect(() => {
    const saveOnPageHide = () => saveWatchedProgress(true);
    window.addEventListener("pagehide", saveOnPageHide);
    return () => window.removeEventListener("pagehide", saveOnPageHide);
  }, [saveWatchedProgress]);

  const onVideoPlay = () => {
    setState((pv) => ({ ...pv, paused: false }));
  };

  const onVideoPause = () => {
    setState((pv) => ({ ...pv, paused: true }));
    saveWatchedProgress(true);
  };

  const onVideoVolumeChange = () => {
    setConfigVolume(videoRef.current?.volume || 0);
  };

  const onVideoLoadedMetadata = () => {
    setMetadata((pv) => ({
      ...pv,
      duration: videoRef.current?.duration || 0,
    }));
    setState((pv) => ({ ...pv, paused: true, isLoading: true }));
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
    saveWatchedProgress(true);
    void videoRef.current?.play().catch(console.warn);
  };

  const onVideoRateChange = () => {
    if (videoRef.current && videoRef.current.playbackRate !== playbackRate) {
      videoRef.current.playbackRate = playbackRate;
    }
  };

  const onVideoTimeUpdate = () => {
    setMetadata((pv) => ({
      ...pv,
      currentTime: videoRef.current?.currentTime || 0,
    }));
    saveWatchedProgress();
  };

  const onVideoEnded = () => {
    saveWatchedProgress(true);
    if (!playerConfig.autoPlay || !movie) return;
    const next = findNext(movie);
    if (!next) return;
    void navigate({ to: "/movies/$movie", params: { movie: next.id } });
  };

  const onVideoCanPlay = () => {
    setState((pv) => ({ ...pv, isLoading: false }));
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  };

  const onVideoSeeked = () => setState((pv) => ({ ...pv, isLoading: false }));
  const onVideoSeeking = () => setState((pv) => ({ ...pv, isLoading: true }));

  const loadVideo = useCallback(
    (video: HTMLVideoElement, url: string, restoreAudioTrackId?: number) => {
      if (Hls.isSupported()) {
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
        const hls = new Hls({
          xhrSetup: (xhr, requestUrl) => {
            // Only the trusted API origin receives session credentials.
            xhr.withCredentials = isApiUrl(requestUrl);
          },
          enableWorker: true,
          lowLatencyMode: true,
        });
        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_event, data) => {
          setAudioTracks(
            data.audioTracks.map((track) => ({
              id: track.id,
              name: track.name,
              lang: track.lang,
            })),
          );
          if (
            restoreAudioTrackId !== undefined &&
            restoreAudioTrackId >= 0 &&
            data.audioTracks.some((track) => track.id === restoreAudioTrackId)
          ) {
            hls.audioTrack = restoreAudioTrackId;
          }
        });
        hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_event, data) => {
          selectedAudioTrackRef.current = data.id;
          setAudioTrackId(data.id);
        });
        hls.loadSource(url);
        hls.attachMedia(video);
        hlsRef.current = hls;
        setHls(hls);
        video.crossOrigin = "anonymous";
        video.disableRemotePlayback = true;
      } else {
        console.error(
          "This is an old browser that does not support MSE https://developer.mozilla.org/en-US/docs/Web/API/Media_Source_Extensions_API",
        );
      }
      setPlayerConfig((pv) => ({ ...pv }));
    },
    [setPlayerConfig, setHls, setAudioTracks, setAudioTrackId],
  );

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.playbackRate = playbackRate;
  }, [playbackRate, videoRef.current]);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.volume = configVolume;
  }, [configVolume, videoRef.current]);

  useEffect(() => {
    if (!videoRef.current) return;
    const variant = movie?.variants[0];
    if (!variant) {
      videoRef.current.srcObject = null;
      selectedAudioTrackRef.current = -1;
      setAudioTracks([]);
      setAudioTrackId(-1);
      setHls(null);
      return;
    }

    if (url !== "" && sameVodSource(variant.contentUrl, url)) {
      const currentTime = videoRef.current.currentTime;
      void loadVideo(
        videoRef.current,
        variant.contentUrl,
        selectedAudioTrackRef.current,
      );
      videoRef.current.currentTime = currentTime;
    } else {
      selectedAudioTrackRef.current = -1;
      void loadVideo(videoRef.current, variant.contentUrl);
    }
    setUrl(variant.contentUrl);
    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
      setHls(null);
      setAudioTracks([]);
      setAudioTrackId(-1);
    };
  }, [
    videoRef.current,
    movie,
    url,
    loadVideo,
    setHls,
    setAudioTracks,
    setAudioTrackId,
  ]);

  return (
    <video
      ref={videoRef}
      className={className}
      onPlay={onVideoPlay}
      onRateChange={onVideoRateChange}
      onPause={onVideoPause}
      onVolumeChange={onVideoVolumeChange}
      onLoadedMetadata={onVideoLoadedMetadata}
      onTimeUpdate={onVideoTimeUpdate}
      onCanPlay={onVideoCanPlay}
      onSeeking={onVideoSeeking}
      onSeeked={onVideoSeeked}
      onEnded={onVideoEnded}
    />
  );
};

// Playback URLs embed a short-lived token (/vod/<token>/<key>/...) that
// rotates hourly; the same movie must not look like a new source when only
// the token changed, or the position would reset.
const stripVodToken = (contentUrl: string): string =>
  contentUrl.replace(/(\/vod\/)[^/]+\//, "$1");
const sameVodSource = (a: string, b: string): boolean =>
  stripVodToken(a) === stripVodToken(b);

export { Video };
