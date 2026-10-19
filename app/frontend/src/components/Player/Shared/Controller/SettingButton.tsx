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
    setMetadata((pv) => ({ ...pv, isSetting: !pv.isSetting }));
    if (!metadata.isSetting) {
      setPlayerSetting(["main"]);
    }
  };

  return (
    <button
      className={className}
      onClick={toggleSettings}
      type="button"
      aria-label={`設定メニューを${metadata.isSetting ? "閉じる" : "開く"}`}
    >
      <Settings />
    </button>
  );
};

export { SettingButton };
