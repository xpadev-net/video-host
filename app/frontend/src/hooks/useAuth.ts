import { useSetAtom } from "jotai";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthTokenAtom } from "@/atoms/Auth";

export function useAuth() {
  const router = useRouter();
  const setAuthToken = useSetAtom(AuthTokenAtom);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleAuthSuccess = (token: string) => {
    setAuthToken(token);
    const callback = new URLSearchParams(window.location.search).get(
      "callback",
    );
    router.push(callback ? decodeURIComponent(callback) : "/");
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
