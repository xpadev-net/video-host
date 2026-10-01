import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AuthForm, AuthLayout, FormField } from "@/components/Auth";
import { Button } from "@/components/ui/button";
import { SiteName } from "@/contexts/env";
import { getSafeCallback, useAuth } from "@/hooks/useAuth";
import { authClient } from "@/lib/auth-client";
import { type AuthConfig, getAuthConfig } from "@/service/getAuthConfig";

type LoginSearch = { callback?: string; error?: string };

const ssoErrorMessages: Record<string, string> = {
  sso_failed: "SSOログインに失敗しました",
  sso_unavailable: "SSOログインは現在利用できません",
  sso_user_not_found: "このアカウントは登録されていません",
  sso_identity_taken: "このSSOアカウントは既に別のアカウントに連携されています",
};

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => {
    const callback =
      typeof search.callback === "string"
        ? getSafeCallback(search.callback)
        : null;
    return {
      ...(callback ? { callback } : {}),
      ...(typeof search.error === "string" ? { error: search.error } : {}),
    };
  },
  head: () => ({ meta: [{ title: `ログイン - ${SiteName}` }] }),
  component: LoginRoute,
});

function LoginRoute() {
  const navigate = useNavigate();
  const { callback: callbackSearch, error: ssoError } = Route.useSearch();
  const callback = getSafeCallback(callbackSearch ?? null);
  const {
    loading,
    error,
    setError,
    startAuth,
    handleAuthSuccess,
    handleAuthError,
  } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const passwordAuthEnabled = authConfig?.passwordAuthEnabled ?? false;
  const ssoEnabled = Boolean(
    authConfig?.ssoEnabled && authConfig.ssoProviderId,
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [config, sessionResult] = await Promise.all([
          getAuthConfig(),
          authClient.getSession(),
        ]);
        if (cancelled) return;
        if (ssoError) {
          setError(ssoErrorMessages[ssoError] ?? "SSOログインに失敗しました");
        } else if (sessionResult.data) {
          await navigate({ to: callback ?? "/", replace: true });
          return;
        }
        setAuthConfig(config);
        if (!config)
          setError(
            "認証設定を取得できませんでした。ページを再読み込みしてください",
          );
      } catch {
        if (!cancelled)
          setError(
            "ネットワークエラーが発生しました。ページを再読み込みしてください",
          );
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [callback, navigate, setError, ssoError]);

  const handleSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!passwordAuthEnabled || !startAuth()) return;
    try {
      const { error } = await authClient.signIn.email({ email, password });
      if (error)
        handleAuthError("メールアドレスまたはパスワードが正しくありません");
      else await handleAuthSuccess();
    } catch {
      handleAuthError("ネットワークエラーが発生しました");
    }
  };

  const handleSsoLogin = async () => {
    if (!authConfig?.ssoProviderId || !startAuth()) return;
    try {
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      callbackUrl.searchParams.set("callback", callback ?? "/");
      const errorUrl = new URL("/login", window.location.origin);
      errorUrl.searchParams.set("error", "sso_failed");
      if (callback) errorUrl.searchParams.set("callback", callback);
      const { error } = await authClient.signIn.social({
        provider: authConfig.ssoProviderId,
        callbackURL: callbackUrl.href,
        errorCallbackURL: errorUrl.href,
      });
      if (error) handleAuthError("SSOログインに失敗しました");
    } catch {
      handleAuthError("ネットワークエラーが発生しました");
    }
  };

  if (initialLoading) {
    return (
      <AuthLayout title="ログイン" description="読み込み中...">
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
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
          isDisabled={loading || !email || !password}
          linkText="アカウントをお持ちでない方は"
          linkHref="/register"
          linkLabel="新規登録"
          error={error}
          showLink={authConfig?.signupEnabled !== false}
          callback={callback ?? undefined}
        >
          <FormField
            type="email"
            placeholder="メールアドレス"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            disabled={loading}
            required
          />
          <FormField
            type="password"
            placeholder="パスワード"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            disabled={loading}
            required
          />
        </AuthForm>
      ) : error ? (
        <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
          {error}
        </div>
      ) : null}
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
}
