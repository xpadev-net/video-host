"use client";

import { useSetAtom } from "jotai";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AuthTokenAtom } from "@/atoms/Auth";
import { AuthLayout } from "@/components/Auth";
import { getSafeCallback } from "@/hooks/useAuth";

/**
 * Landing page for the SSO flow: the backend redirects here with the
 * session token once the provider login has completed.
 */
const AuthCallbackPage = () => {
  const router = useRouter();
  const setAuthToken = useSetAtom(AuthTokenAtom);

  useEffect(() => {
    // Backend sends the token in the fragment (#...) so it never reaches
    // server logs or Referer headers; fall back to query for errors.
    const hash = window.location.hash.replace(/^#/, "");
    const params = hash
      ? new URLSearchParams(hash)
      : new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (!token) {
      const error = params.get("error") ?? "sso_failed";
      router.replace(`/login?error=${encodeURIComponent(error)}`);
      return;
    }
    setAuthToken(token);
    router.replace(getSafeCallback(params.get("callback")) ?? "/");
  }, [router, setAuthToken]);

  return (
    <AuthLayout title="SSOログイン" description="ログイン処理中です...">
      <div className="flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    </AuthLayout>
  );
};

export default AuthCallbackPage;
