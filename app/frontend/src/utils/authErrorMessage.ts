export function getAuthErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") return fallback;

  const { status, code } = error as { status?: unknown; code?: unknown };
  if (status === 429 || code === "RATE_LIMITED") {
    return "試行回数が上限に達しました。しばらくしてからもう一度お試しください。";
  }
  if (typeof status === "number" && status >= 500) {
    return "サーバーでエラーが発生しました。しばらくしてからもう一度お試しください。";
  }

  if (
    code === "INVALID_EMAIL_OR_PASSWORD" ||
    code === "INVALID_EMAIL_OR_PASSWORD_ERROR" ||
    code === "USER_NOT_FOUND" ||
    code === "INVALID_PASSWORD"
  ) {
    return "メールアドレスまたはパスワードが正しくありません";
  }

  return fallback;
}
