"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AuthForm, AuthLayout, FormField } from "@/components/Auth";
import { RequireSignupCode, SiteName } from "@/contexts/env";
import { useAuth } from "@/hooks/useAuth";
import { type AuthConfig, getAuthConfig } from "@/service/getAuthConfig";
import { postUsers } from "@/service/postUsers";
import {
  validatePassword,
  validatePasswordMatch,
} from "@/utils/authValidation";

const RegisterPage = () => {
  const { loading, error, startAuth, handleAuthSuccess, handleAuthError } =
    useAuth();

  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [signupCode, setSignupCode] = useState("");
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);

  // When the config is unavailable (older backend), fall back to password auth
  const passwordAuthEnabled = authConfig?.passwordAuthEnabled ?? true;

  useEffect(() => {
    // Set page title
    document.title = `新規登録 - ${SiteName}`;

    void (async () => {
      const config = await getAuthConfig();
      setAuthConfig(config);
      setConfigLoaded(true);
    })();
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    startAuth();

    // バリデーション
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
      const body = await postUsers(
        username,
        name,
        password,
        RequireSignupCode ? signupCode : "",
      );

      if (body.status === "ok") {
        handleAuthSuccess(body.data.token);
      } else {
        handleAuthError("登録に失敗しました");
      }
    } catch {
      handleAuthError("ネットワークエラーが発生しました");
    }
  };

  const isFormValid =
    username &&
    name &&
    password &&
    confirmPassword &&
    (!RequireSignupCode || signupCode);

  if (!configLoaded) {
    return (
      <AuthLayout title="新規登録" description="読み込み中...">
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AuthLayout>
    );
  }

  if (!passwordAuthEnabled) {
    return (
      <AuthLayout
        title="新規登録"
        description="このインスタンスではパスワード登録は無効です"
      >
        <p className="text-sm text-muted-foreground text-center">
          アカウントはSSOログイン時に自動で作成されます。
        </p>
        <div className="text-center text-sm">
          <Link href="/login" className="text-primary hover:underline">
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
          type="text"
          placeholder="表示名"
          value={name}
          onChange={setName}
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
        <FormField
          type="password"
          placeholder="パスワード確認"
          value={confirmPassword}
          onChange={setConfirmPassword}
          disabled={loading}
          required
        />
        {RequireSignupCode && (
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
};

export default RegisterPage;
