import { useSyncExternalStore } from "react";

const useIsMobile = () => {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia("(pointer: coarse)");
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(pointer: coarse)").matches,
    () => false,
  );
};

export { useIsMobile };
