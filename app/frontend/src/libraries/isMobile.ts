import { useSyncExternalStore } from "react";

let initialCoarsePointer: boolean | undefined;

const subscribeToPointerChanges = () => () => {};

const getInitialCoarsePointer = () => {
  initialCoarsePointer ??= window.matchMedia("(pointer: coarse)").matches;
  return initialCoarsePointer;
};

const useIsMobile = () => {
  return useSyncExternalStore(
    subscribeToPointerChanges,
    getInitialCoarsePointer,
    () => false,
  );
};

export { useIsMobile };
