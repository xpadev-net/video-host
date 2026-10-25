import { useAtom, useSetAtom } from "jotai";
import { Settings } from "lucide-react";
import type { MouseEvent } from "react";
import { PlayerSettingAtom, PlayerStateAtom } from "@/atoms/Player";

type props = {
  className?: string;
};

const SettingButton = ({ className }: props) => {
  const [metadata, setMetadata] = useAtom(PlayerStateAtom);
  const setPlayerSetting = useSetAtom(PlayerSettingAtom);
  const toggleSettings = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const isOpening = !metadata.isSetting;
    setMetadata((pv) => ({ ...pv, isSetting: isOpening }));
    if (isOpening) {
      setPlayerSetting(["main"]);
    }
  };

  return (
    <button
      className={className}
      onClick={toggleSettings}
      type="button"
      aria-label={`設定メニューを${metadata.isSetting ? "閉じる" : "開く"}`}
      aria-haspopup="dialog"
      aria-expanded={metadata.isSetting}
      aria-controls="player-settings-menu"
    >
      <Settings />
    </button>
  );
};

export { SettingButton };
