import { useEffect, useRef } from "react";
import useSWR, { type SWRConfiguration } from "swr";

const useStickyResult = <T>(
  value: T | null | undefined,
  isEnabled: boolean,
  key: unknown,
): T | undefined => {
  const val = useRef<{ key: unknown; value: T } | undefined>(undefined);
  useEffect(() => {
    if (!isEnabled) {
      val.current = undefined;
    } else if (value !== null && value !== undefined) {
      val.current = { key, value };
    }
  }, [isEnabled, key, value]);

  if (!isEnabled) return undefined;
  if (value !== null && value !== undefined) return value;
  const stickyValue = val.current;
  if (stickyValue && stickyValue.key === key) return stickyValue.value;
  return undefined;
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
    data: useStickyResult(swr.data, isEnabled, key) as T,
  };
};
