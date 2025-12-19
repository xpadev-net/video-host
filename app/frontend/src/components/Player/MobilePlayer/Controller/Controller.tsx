import type { FilteredMovie } from "@/@types/v4Api";
import { DefaultController } from "./DefaultController";
import { PiPController } from "./PiPController";

type props = {
  data: FilteredMovie;
  className?: string;
  isPipMode?: boolean;
  isHovering?: boolean;
};

const Controller = ({
  className,
  data,
  isPipMode = false,
  isHovering = true,
}: props) => {
  if (isPipMode) {
    return (
      <PiPController
        data={data}
        className={className}
        isHovering={isHovering}
      />
    );
  }
  return (
    <DefaultController
      data={data}
      className={className}
      isHovering={isHovering}
    />
  );
};

export { Controller };
