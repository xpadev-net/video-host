"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthLayout } from "@/components/Auth";
import { getSafeCallback } from "@/hooks/useAuth";
import { client } from "@/lib/client";

/**
 * Landing page for the SSO account-link flow: the backend redirects here
 * with a one-time link token after the provider round-trip. The actual
 * link is committed by POST /sso/link/confirm, which requires the session
 * of the account that started the flow — a token forwarded to another
 * user's browser is rejected there.
 */
const AuthLinkPage = () => {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    const params = hash
      ? new URLSearchParams(hash)
      : new URLSearchParams(window.location.search);
    const token = params.get("token");
    const callback = getSafeCallback(params.get("callback")) ?? "/dashboard";
    if (!token) {
      setError("SSO連携トークンが見つかりません");
      return;
    }
    void (async () => {
      try {
        const res = await client.api.v4.auth.sso.link.confirm.$post({
          json: { token },
        });
        if (res.ok) {
          router.replace(callback);
          return;
        }
        setError("SSO連携に失敗しました。もう一度やり直してください");
      } catch {
        setError("SSO連携に失敗しました。もう一度やり直してください");
      }
    })();
  }, [router]);

  return (
    <AuthLayout title="SSO連携" description="アカウントを連携しています...">
      {error ? (
        <p className="text-center text-sm text-red-500">{error}</p>
      ) : (
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      )}
    </AuthLayout>
  );
};

export default AuthLinkPage;
