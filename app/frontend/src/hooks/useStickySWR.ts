import { useEffect, useRef } from "react";
import useSWR, { type SWRConfiguration } from "swr";

const serializeKey = (key: unknown) => {
  if (typeof key === "string") return key;
  try {
    return JSON.stringify(key);
  } catch {
    return undefined;
  }
};

const useStickyResult = <T>(
  value: T | null | undefined,
  isEnabled: boolean,
  keyId: string | undefined,
): T | undefined => {
  const val = useRef<{ keyId: string | undefined; value: T } | undefined>(
    undefined,
  );
  useEffect(() => {
    if (!isEnabled) {
      val.current = undefined;
    } else if (value !== null && value !== undefined) {
      val.current = { keyId, value };
    }
  }, [isEnabled, keyId, value]);

  if (!isEnabled) return undefined;
  if (value !== null && value !== undefined) return value;
  const stickyValue = val.current;
  if (stickyValue && stickyValue.keyId === keyId) return stickyValue.value;
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
  const keyId = serializeKey(key);
  return {
    ...swr,
    data: useStickyResult(swr.data, isEnabled, keyId) as T,
  };
};
