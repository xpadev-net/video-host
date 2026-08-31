import * as Switch from "@radix-ui/react-switch";
import { useAtom } from "jotai";
import { MdPause, MdPlayArrow } from "react-icons/md";

import { PlayerConfigAtom } from "@/atoms/Player";

type props = {
  className?: string;
};

const AutoPlayButton = ({ className }: props) => {
  const [playerConfig, setPlayerConfig] = useAtom(PlayerConfigAtom);

  const updateAutoPlay = (autoPlay: boolean) => {
    setPlayerConfig((pv) => ({ ...pv, autoPlay }));
  };

  return (
    <Switch.Root
      className={className}
      checked={playerConfig.autoPlay}
      onCheckedChange={updateAutoPlay}
      onClick={(event) => event.stopPropagation()}
      aria-label="Autoplay"
    >
      <span className="inline-block w-[30px] h-[10px] rounded-full bg-white/50 relative cursor-pointer">
        <Switch.Thumb
          className={`w-[17px] h-[17px] absolute rounded-full left-[8px] top-[50%] -translate-y-[50%] -translate-x-[50%] flex items-center justify-center transition-all data-[state=checked]:left-[22px] ${
            playerConfig.autoPlay ? "bg-white" : "bg-gray-600"
          }`}
        >
          {playerConfig.autoPlay ? (
            <MdPlayArrow className={"w-[13px] h-[13px] text-black"} />
          ) : (
            <MdPause className={"w-[13px] h-[13px] text-white"} />
          )}
        </Switch.Thumb>
      </span>
    </Switch.Root>
  );
};

export { AutoPlayButton };
