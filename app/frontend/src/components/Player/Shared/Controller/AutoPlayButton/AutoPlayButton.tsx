import * as Switch from "@radix-ui/react-switch";
import { useAtom } from "jotai";
import { Pause, Play } from "lucide-react";

import { PlayerConfigAtom } from "@/atoms/Player";

type props = {
  className?: string;
};

const AutoPlayButton = ({ className }: props) => {
  const [playerConfig, setPlayerConfig] = useAtom(PlayerConfigAtom);

  const updateAutoPlayNext = (autoPlayNext: boolean) => {
    setPlayerConfig((pv) => ({ ...pv, autoPlayNext }));
  };

  return (
    <Switch.Root
      className={className}
      checked={playerConfig.autoPlayNext}
      onCheckedChange={updateAutoPlayNext}
      onClick={(event) => event.stopPropagation()}
      aria-label="Autoplay"
    >
      <span className="inline-block w-[30px] h-[10px] rounded-full bg-white/50 relative cursor-pointer">
        <Switch.Thumb
          className={`w-[17px] h-[17px] absolute rounded-full left-[8px] top-[50%] -translate-y-[50%] -translate-x-[50%] flex items-center justify-center transition-all data-[state=checked]:left-[22px] ${
            playerConfig.autoPlayNext ? "bg-white" : "bg-gray-600"
          }`}
        >
          {playerConfig.autoPlayNext ? (
            <Play className="w-[13px] h-[13px] text-black" aria-hidden="true" />
          ) : (
            <Pause
              className="w-[13px] h-[13px] text-white"
              aria-hidden="true"
            />
          )}
        </Switch.Thumb>
      </span>
    </Switch.Root>
  );
};

export { AutoPlayButton };
