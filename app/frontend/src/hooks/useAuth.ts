import { useRouter } from "@tanstack/react-router";
import { useSetAtom } from "jotai";
import { useState } from "react";

import { AuthTokenAtom } from "@/atoms/Auth";

export const getSafeCallback = (callback: string | null) => {
  if (!callback) {
    return null;
  }
  try {
    const decoded = decodeURIComponent(callback);
    if (
      decoded.startsWith("/") &&
      !decoded.startsWith("//") &&
      !decoded.includes("://")
    ) {
      return decoded;
    }
  } catch {
    return null;
  }
  return null;
};

export function useAuth() {
  const router = useRouter();
  const setAuthToken = useSetAtom(AuthTokenAtom);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleAuthSuccess = (token: string) => {
    setAuthToken(token);
    const callback = getSafeCallback(
      new URLSearchParams(window.location.search).get("callback"),
    );
    router.history.push(callback ?? "/");
  };

  const handleAuthError = (message?: string) => {
    setError(message || "認証に失敗しました");
    setLoading(false);
  };

  const startAuth = () => {
    setLoading(true);
    setError("");
  };

  return {
    loading,
    error,
    setError,
    startAuth,
    setLoading,
    handleAuthSuccess,
    handleAuthError,
  };
}
