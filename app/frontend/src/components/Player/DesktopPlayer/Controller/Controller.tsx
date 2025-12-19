import type { FilteredMovie } from "@/@types/v4Api";
import { DefaultController } from "./DefaultController";
import { PiPController } from "./PiPController";

type props = {
  data: FilteredMovie;
  isHovering: boolean;
  isPipMode?: boolean;
};

const Controller = ({ data, isPipMode = false, isHovering }: props) => {
  if (isPipMode) {
    return <PiPController data={data} isHovering={isHovering} />;
  }
  return <DefaultController data={data} isHovering={isHovering} />;
};

export { Controller };
