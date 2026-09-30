import type { Options } from "@xpadev-net/niconicomments";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  Activity,
  AppWindow,
  AudioLines,
  Gauge,
  MessageSquareText,
  PictureInPicture2,
  Sigma,
  VectorSquare,
} from "lucide-react";
import type {
  SelectionItem,
  SettingKey,
  SettingPageConfig,
} from "@/@types/Player";
import {
  AudioTrackIdAtom,
  AudioTracksAtom,
  HlsRefAtom,
  NiconicommentsConfigAtom,
  PlayerConfigAtom,
  PlayerPlaybackRateAtom,
  PlayerSettingAtom,
  PlayerStateAtom,
  VideoRefAtom,
  WrapperRefAtom,
} from "@/atoms/Player";
import { EnableComments } from "@/contexts/env";

const suggestedRate = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4];

// ヘルパー関数: 型安全なSelectionItemを作成
const createSelectionItem = <T>(
  id: string,
  label: string,
  options: Array<{ value: T; label: string | number }>,
  getValue: () => T,
  onChange: (value: T) => void,
  ariaLabel?: string,
): SelectionItem<T> => ({
  type: "selection",
  id,
  label,
  options,
  getValue,
  onChange,
  ariaLabel,
});

export const useSettingDefinitions = (): Record<
  SettingKey,
  SettingPageConfig
> => {
  const [playerConfig, setPlayerConfig] = useAtom(PlayerConfigAtom);
  const [state, setState] = useAtom(PlayerStateAtom);
  const [niconicommentsConfig, setNiconicommentsConfig] = useAtom(
    NiconicommentsConfigAtom,
  );
  const wrapperRef = useAtomValue(WrapperRefAtom);
  const videoRef = useAtomValue(VideoRefAtom);
  const setPlayerSetting = useSetAtom(PlayerSettingAtom);
  const [playbackRate, setPlaybackRate] = useAtom(PlayerPlaybackRateAtom);
  const audioTracks = useAtomValue(AudioTracksAtom);
  const audioTrackId = useAtomValue(AudioTrackIdAtom);
  const hls = useAtomValue(HlsRefAtom);

  const toggleWindowFullscreen = () => {
    setPlayerConfig((pv) => ({
      ...pv,
      windowFullscreen: !pv.windowFullscreen,
    }));
    if (state.isFullscreen) {
      if (playerConfig.windowFullscreen) {
        wrapperRef
          ?.requestFullscreen()
          .catch(() => setState((pv) => ({ ...pv, isFullscreen: false })));
      } else {
        document.fullscreenElement && void document.exitFullscreen();
      }
    }
  };

  const updatePlaybackRate = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef) videoRef.playbackRate = rate;
    setPlayerSetting((prev) => prev.filter((page) => page !== "playbackRate"));
  };

  const audioTrackLabel = (id: number) =>
    audioTracks.find((track) => track.id === id)?.name || `トラック ${id + 1}`;

  const updateAudioTrack = (id: number) => {
    if (hls) hls.audioTrack = id;
    setPlayerSetting((prev) => prev.filter((page) => page !== "audioTrack"));
  };

  const toggleCommentActive = () => {
    setPlayerConfig((prev) => ({
      ...prev,
      isNiconicommentsEnable: !prev.isNiconicommentsEnable,
    }));
  };

  const toggleNiconicommentsConfig = (key: keyof Options) => {
    setNiconicommentsConfig((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const togglePipEnable = () => {
    setPlayerConfig((prev) => ({
      ...prev,
      isPipEnable: !prev.isPipEnable,
    }));
  };

  const mainConfig: SettingPageConfig = [
    {
      type: "navigation",
      id: "playbackRate",
      label: "再生速度",
      icon: Gauge,
      targetPage: "playbackRate",
      getValue: () => playbackRate,
    },
    ...(audioTracks.length > 1
      ? [
          {
            type: "navigation" as const,
            id: "audioTrack",
            label: "音声トラック",
            icon: AudioLines,
            targetPage: "audioTrack" as SettingKey,
            getValue: () => audioTrackLabel(audioTrackId),
          },
        ]
      : []),
    ...(EnableComments
      ? [
          {
            type: "navigation" as const,
            id: "comments",
            label: "コメント",
            icon: MessageSquareText,
            targetPage: "comments" as SettingKey,
            getValue: () =>
              playerConfig.isNiconicommentsEnable ? "有効" : "無効",
          },
        ]
      : []),
    {
      type: "toggle",
      id: "windowFullscreen",
      label: "ウィンドウフルスクリーン",
      icon: AppWindow,
      getValue: () => playerConfig.windowFullscreen,
      onChange: toggleWindowFullscreen,
    },
  ];

  const playbackRateConfig: SettingPageConfig = [
    {
      type: "back",
      label: "再生速度",
      targetPage: "playbackRate",
    },
    createSelectionItem(
      "playbackRate",
      "再生速度",
      suggestedRate.map((value) => ({ value, label: value })),
      () => playbackRate,
      updatePlaybackRate,
    ),
  ];

  const audioTrackConfig: SettingPageConfig = [
    {
      type: "back",
      label: "音声トラック",
      targetPage: "audioTrack",
    },
    createSelectionItem(
      "audioTrack",
      "音声トラック",
      audioTracks.map((track) => ({
        value: track.id,
        label: track.name || track.lang || `トラック ${track.id + 1}`,
      })),
      () => audioTrackId,
      updateAudioTrack,
    ),
  ];

  const commentsConfig: SettingPageConfig = [
    {
      type: "back",
      label: "コメント",
      targetPage: "comments",
    },
    {
      type: "toggle",
      id: "isNiconicommentsEnable",
      label: "コメント",
      icon: MessageSquareText,
      getValue: () => playerConfig.isNiconicommentsEnable,
      onChange: toggleCommentActive,
    },
    {
      type: "toggle",
      id: "showFPS",
      label: "FPS表示",
      icon: Activity,
      getValue: () => !!niconicommentsConfig.showFPS,
      onChange: () => toggleNiconicommentsConfig("showFPS"),
    },
    {
      type: "toggle",
      id: "showCollision",
      label: "当たり判定表示",
      icon: VectorSquare,
      getValue: () => !!niconicommentsConfig.showCollision,
      onChange: () => toggleNiconicommentsConfig("showCollision"),
    },
    {
      type: "toggle",
      id: "showCommentCount",
      label: "コメント数表示",
      icon: Sigma,
      getValue: () => !!niconicommentsConfig.showCommentCount,
      onChange: () => toggleNiconicommentsConfig("showCommentCount"),
    },
    {
      type: "toggle",
      id: "isPipEnable",
      label: "PiP",
      icon: PictureInPicture2,
      getValue: () => playerConfig.isPipEnable,
      onChange: togglePipEnable,
    },
  ];

  return {
    main: mainConfig,
    playbackRate: playbackRateConfig,
    comments: commentsConfig,
    audioTrack: audioTrackConfig,
  };
};
