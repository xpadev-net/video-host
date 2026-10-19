import type { ComponentType } from "react";

export type PlayerConfig = {
  windowFullscreen: boolean;
  autoPlay: boolean;
  isTheatre: boolean;
};

export type VideoMetadata = {
  currentTime: number;
  duration: number;
};

export type PlayerState = {
  paused: boolean;
  isLoading: boolean;
  isSetting: boolean;
  isFullscreen: boolean;
  // Set when the source cannot be played (unsupported browser, fatal error).
  error: string | null;
};

export type SettingKey = "main" | "playbackRate" | "audioTrack";

export type PlayerAudioTrack = {
  id: number;
  name: string;
  lang?: string;
};

// Setting Items Types
type BaseSettingItem = {
  id: string;
  label: string;
  icon?: ComponentType;
  ariaLabel?: string;
};

export type NavigationItem = BaseSettingItem & {
  type: "navigation";
  targetPage: SettingKey;
  getValue: () => string | number;
};

export type ToggleItem = BaseSettingItem & {
  type: "toggle";
  getValue: () => boolean;
  onChange: (value: boolean) => void;
};

export type SelectionItem<T = unknown> = BaseSettingItem & {
  type: "selection";
  options: Array<{ value: T; label: string | number }>;
  getValue: () => T;
  onChange: { bivarianceHack(value: T): void }["bivarianceHack"];
};

export type BackItem = {
  type: "back";
  label: string;
  targetPage: SettingKey;
};

export type SettingItem =
  | NavigationItem
  | ToggleItem
  | SelectionItem<unknown>
  | BackItem;
export type SettingPageConfig = SettingItem[];
