import { useEffect, useRef } from "react";
import useSWR, { type SWRConfiguration } from "swr";

const useStickyResult = <T>(
  value: T | null | undefined,
  isEnabled: boolean,
): T | undefined => {
  const val = useRef<T | undefined>(undefined);
  useEffect(() => {
    if (!isEnabled) {
      val.current = undefined;
    } else if (value !== null && value !== undefined) {
      val.current = value;
    }
  }, [isEnabled, value]);

  if (!isEnabled) return undefined;
  return value !== null && value !== undefined ? value : val.current;
};

export const useStickySWR = <T, U, V extends SWRConfiguration>(
  ...args: Parameters<typeof useSWR<T, U, V>>
): ReturnType<typeof useSWR<T, U, V>> => {
  const [inputKey, fetcher, config] = args;
  let key = inputKey;
  if (typeof inputKey === "function") {
    try {
      key = inputKey();
    } catch {
      key = null;
    }
  }
  const swr = useSWR<T, U, V>(key, fetcher, config);
  const isEnabled = Boolean(key);
  return {
    ...swr,
    data: useStickyResult(swr.data, isEnabled) as T,
  };
};
