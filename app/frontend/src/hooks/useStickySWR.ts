import { useRef } from "react";
import useSWR, { type SWRConfiguration } from "swr";

const useStickyResult = <T>(
  value: T | null | undefined,
  isEnabled: boolean,
): T | undefined => {
  const val = useRef<T | undefined>(undefined);
  if (!isEnabled) {
    val.current = undefined;
  } else if (value !== null && value !== undefined) {
    val.current = value;
  }
  return val.current;
};

export const useStickySWR = <T, U, V extends SWRConfiguration>(
  ...args: Parameters<typeof useSWR<T, U, V>>
): ReturnType<typeof useSWR<T, U, V>> => {
  const swr = useSWR<T, U, V>(...args);
  const isEnabled = Boolean(args[0]);
  return {
    ...swr,
    data: useStickyResult(swr.data, isEnabled) as T,
  };
};
