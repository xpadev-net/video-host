import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AuthForm, AuthLayout, FormField } from "@/components/Auth";
import { RequireSignupCode, SiteName } from "@/contexts/env";
import { getSafeCallback, useAuth } from "@/hooks/useAuth";
import { authClient } from "@/lib/auth-client";
import { type AuthConfig, getAuthConfig } from "@/service/getAuthConfig";
import {
  validatePassword,
  validatePasswordMatch,
} from "@/utils/authValidation";

export const Route = createFileRoute("/register")({
  validateSearch: (search: Record<string, unknown>) => ({
    callback:
      typeof search.callback === "string"
        ? (getSafeCallback(search.callback) ?? undefined)
        : undefined,
  }),
  head: () => ({ meta: [{ title: `新規登録 - ${SiteName}` }] }),
  component: RegisterRoute,
});

function RegisterRoute() {
  const { loading, error, startAuth, handleAuthSuccess, handleAuthError } =
    useAuth();
  const { callback } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [signupCode, setSignupCode] = useState("");
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const requireSignupCode = authConfig?.requireSignupCode ?? RequireSignupCode;
  const passwordAuthEnabled = authConfig?.passwordAuthEnabled ?? false;

  useEffect(() => {
    void getAuthConfig().then((config) => {
      setAuthConfig(config);
      setConfigLoaded(true);
    });
  }, []);

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!passwordAuthEnabled || !authConfig?.signupEnabled || !startAuth())
      return;
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      handleAuthError(passwordValidation.error);
      return;
    }
    const passwordMatchValidation = validatePasswordMatch(
      password,
      confirmPassword,
    );
    if (!passwordMatchValidation.isValid) {
      handleAuthError(passwordMatchValidation.error);
      return;
    }
    try {
      const { error } = await authClient.signUp.email({
        email,
        name,
        password,
        ...(requireSignupCode ? { signupCode } : {}),
      });
      if (error) handleAuthError(error.message || "登録に失敗しました");
      else await handleAuthSuccess();
    } catch {
      handleAuthError("ネットワークエラーが発生しました");
    }
  };

  const isFormValid =
    email &&
    name &&
    password &&
    confirmPassword &&
    (!requireSignupCode || signupCode);
  if (!configLoaded) {
    return (
      <AuthLayout title="新規登録" description="読み込み中...">
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </AuthLayout>
    );
  }
  if (!authConfig) {
    return (
      <AuthLayout title="新規登録" description="認証設定を取得できませんでした">
        <p role="alert">ページを再読み込みしてください。</p>
      </AuthLayout>
    );
  }
  if (!passwordAuthEnabled || authConfig.signupEnabled === false) {
    return (
      <AuthLayout
        title="新規登録"
        description="このインスタンスでは新規登録は無効です"
      >
        <p className="text-sm text-muted-foreground text-center">
          アカウントについては管理者にお問い合わせください。
        </p>
        <div className="text-center text-sm">
          <Link to="/login" className="text-primary hover:underline">
            ログインページへ
          </Link>
        </div>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout
      title="新規登録"
      description="新しいアカウントを作成してください"
    >
      <AuthForm
        onSubmit={handleRegister}
        submitText="新規登録"
        submitTextLoading="登録中..."
        isLoading={loading}
        isDisabled={loading || !isFormValid}
        linkText="すでにアカウントをお持ちですか？"
        linkHref="/login"
        linkLabel="ログイン"
        error={error}
        callback={callback}
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
          type="text"
          placeholder="表示名"
          value={name}
          onChange={setName}
          autoComplete="name"
          disabled={loading}
          required
        />
        <FormField
          type="password"
          placeholder="パスワード"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          disabled={loading}
          required
        />
        <FormField
          type="password"
          placeholder="パスワード確認"
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
          disabled={loading}
          required
        />
        {requireSignupCode && (
          <FormField
            type="text"
            placeholder="登録コード"
            value={signupCode}
            onChange={setSignupCode}
            disabled={loading}
            required
          />
        )}
      </AuthForm>
    </AuthLayout>
  );
}
