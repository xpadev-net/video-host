import type { FormattedMovie } from "@video-host/backend";
import type Hls from "hls.js";
import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type {
  PlayerAudioTrack,
  PlayerConfig,
  PlayerState,
  SettingKey,
  VideoMetadata,
} from "@/@types/Player";

const DurablePlayerAtom = atom<{
  target: HTMLElement | null;
  className?: string;
} | null>(null);
const CurrentMovieAtom = atom<FormattedMovie | null>(null);

const WrapperRefAtom = atom<HTMLElement | null>(null);
const VideoRefAtom = atom<HTMLVideoElement | null>(null);
const HlsRefAtom = atom<Hls | null>(null);
const StopPlayerAtom = atom(null, (get, set) => {
  const video = get(VideoRefAtom);
  video?.pause();
  if (video) {
    video.removeAttribute("src");
    video.srcObject = null;
    video.load();
  }
  get(HlsRefAtom)?.destroy();
  set(HlsRefAtom, null);
  set(VideoRefAtom, null);
  set(CurrentMovieAtom, null);
  // The route component owns the portal target and clears it on unmount. Keep
  // it registered while stopping media so a still-mounted Player can reuse it.
  set(PlayerStateAtom, {
    paused: false,
    isLoading: true,
    isSetting: false,
    isFullscreen: false,
    error: null,
  });
  set(VideoMetadataAtom, { currentTime: 0, duration: 0 });
  set(AudioTracksAtom, []);
  set(AudioTrackIdAtom, -1);
  set(PlayerSettingAtom, ["main"]);
  set(PlayerSeekNotificationAtom, null);
  set(PlayerPlayPauseNotificationAtom, null);
});
const AudioTracksAtom = atom<PlayerAudioTrack[]>([]);
const AudioTrackIdAtom = atom<number>(-1);
const VideoMetadataAtom = atom<VideoMetadata>({ currentTime: 0, duration: 0 });

const PlayerStateAtom = atom<PlayerState>({
  paused: false,
  isLoading: true,
  isSetting: false,
  isFullscreen: false,
  error: null,
});
const PlayerConfigAtom = atomWithStorage<PlayerConfig>("playerConfig", {
  windowFullscreen: true,
  autoPlay: true,
  isTheatre: false,
});

const PlayerPlaybackRateAtom = atomWithStorage<number>(
  "playerConfig.playerPlaybackRate",
  1,
);

const PlayerVolumeAtom = atomWithStorage<number>(
  "playerConfig.playerVolume",
  1,
);

const PlayerSettingAtom = atom<SettingKey[]>(["main"]);

const PlayerSeekNotificationAtom = atom<{
  direction: "forward" | "backward";
  seconds: number;
} | null>(null);

const PlayerPlayPauseNotificationAtom = atom<{
  action: "play" | "pause";
} | null>(null);

export {
  AudioTrackIdAtom,
  AudioTracksAtom,
  CurrentMovieAtom,
  DurablePlayerAtom,
  HlsRefAtom,
  PlayerConfigAtom,
  PlayerPlaybackRateAtom,
  PlayerPlayPauseNotificationAtom,
  PlayerSeekNotificationAtom,
  PlayerSettingAtom,
  PlayerStateAtom,
  PlayerVolumeAtom,
  StopPlayerAtom,
  VideoMetadataAtom,
  VideoRefAtom,
  WrapperRefAtom,
};
