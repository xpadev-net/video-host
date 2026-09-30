"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthForm, AuthLayout, FormField } from "@/components/Auth";
import { Button } from "@/components/ui/button";
import { ApiEndpoint, SiteName } from "@/contexts/env";
import { getSafeCallback, useAuth } from "@/hooks/useAuth";
import { type AuthConfig, getAuthConfig } from "@/service/getAuthConfig";
import { postAuth } from "@/service/postAuth";

const ssoErrorMessages: Record<string, string> = {
  sso_failed: "SSOログインに失敗しました",
  sso_unavailable: "SSOログインは現在利用できません",
  sso_user_not_found: "このアカウントは登録されていません",
  sso_identity_taken: "このSSOアカウントは既に別のアカウントに連携されています",
  sso_link_expired:
    "SSO連携が無効または期限切れです。開始したブラウザでもう一度やり直してください",
};

const LoginPage = () => {
  const router = useRouter();
  const {
    loading,
    error,
    setError,
    startAuth,
    handleAuthSuccess,
    handleAuthError,
  } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);

  // When the config is unavailable (older backend), fall back to password auth
  const passwordAuthEnabled = authConfig?.passwordAuthEnabled ?? true;
  const ssoEnabled = authConfig?.ssoEnabled ?? false;

  useEffect(() => {
    // Set page title
    document.title = `ログイン - ${SiteName}`;

    void (async () => {
      const params = new URLSearchParams(window.location.search);

      // Surface SSO errors bounced back from the backend callback.
      // Checked BEFORE the existing-session redirect so a failed SSO login
      // is not silently swallowed when the browser still holds a token.
      const ssoError = params.get("error");
      if (ssoError) {
        setError(ssoErrorMessages[ssoError] ?? "SSOログインに失敗しました");
      } else {
        // Check if already authenticated
        const token = localStorage.getItem("token");
        if (token && token !== "null" && token.trim() !== "") {
          const callback = getSafeCallback(params.get("callback"));
          router.push(callback ?? "/");
          return;
        }
      }

      const config = await getAuthConfig();
      setAuthConfig(config);
      setInitialLoading(false);
    })();
  }, [router, setError]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    startAuth();

    try {
      const body = await postAuth(username, password);

      if (body.status === "ok") {
        handleAuthSuccess(body.data);
      } else {
        handleAuthError("ログインに失敗しました");
      }
    } catch {
      handleAuthError("ネットワークエラーが発生しました");
    }
  };

  const handleSsoLogin = () => {
    const callback = getSafeCallback(
      new URLSearchParams(window.location.search).get("callback"),
    );
    const query = new URLSearchParams();
    if (callback) {
      query.set("callback", callback);
    }
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    window.location.assign(`${ApiEndpoint}/api/v4/auth/sso/login${suffix}`);
  };

  if (initialLoading) {
    return (
      <AuthLayout title="ログイン" description="読み込み中...">
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="ログイン"
      description={
        passwordAuthEnabled
          ? "アカウントにログインしてください"
          : "SSOでログインしてください"
      }
    >
      {passwordAuthEnabled ? (
        <AuthForm
          onSubmit={handleSignIn}
          submitText="ログイン"
          submitTextLoading="ログイン中..."
          isLoading={loading}
          isDisabled={loading || !username || !password}
          linkText="アカウントをお持ちでない方は"
          linkHref="/register"
          linkLabel="新規登録"
          error={error}
        >
          <FormField
            type="text"
            placeholder="ユーザー名"
            value={username}
            onChange={setUsername}
            disabled={loading}
            required
          />
          <FormField
            type="password"
            placeholder="パスワード"
            value={password}
            onChange={setPassword}
            disabled={loading}
            required
          />
        </AuthForm>
      ) : (
        error && (
          <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
            {error}
          </div>
        )
      )}
      {passwordAuthEnabled && ssoEnabled && (
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">または</span>
          </div>
        </div>
      )}
      {ssoEnabled && (
        <Button
          type="button"
          variant={passwordAuthEnabled ? "outline" : "default"}
          className="w-full"
          onClick={handleSsoLogin}
          disabled={loading}
        >
          {`${authConfig?.ssoDisplayName ?? "SSO"}でログイン`}
        </Button>
      )}
    </AuthLayout>
  );
};

export default LoginPage;
