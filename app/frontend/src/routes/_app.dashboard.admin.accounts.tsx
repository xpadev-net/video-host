import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { DashboardLoading } from "@/components/Dashboard/DashboardLoading";
import { useConfirm, useNotify } from "@/components/Feedback/FeedbackProvider";
import { useAccount } from "@/hooks/useAccount";
import { useAccounts } from "@/hooks/useDashboard";
import { client } from "@/lib/client";

export const Route = createFileRoute("/_app/dashboard/admin/accounts")({
  head: () => ({ meta: [{ title: "アカウント管理" }] }),
  component: AccountsPage,
});

interface Account {
  id: string;
  profiles: { id: string; username: string; name: string }[];
  name: string;
  createdAt: string;
}

function AccountsPage() {
  const { data: user, isLoading: isUserLoading } = useAccount();
  const { data: accounts, mutate } = useAccounts();
  const confirm = useConfirm();
  const notify = useNotify();
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !name.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await client.api.v4.accounts.$post({
        json: { username: username.trim(), name: name.trim() },
      });

      if (!res.ok) throw new Error("作成に失敗しました");

      setUsername("");
      setName("");
      mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "作成に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (
      !(await confirm({
        title: "アカウントを削除しますか？",
        description:
          "このアカウントとプロフィールを削除します。投稿がある場合は先に削除してください。",
        confirmLabel: "削除",
        destructive: true,
      }))
    )
      return;

    setDeletingId(id);
    try {
      const res = await client.api.v4.accounts[":id"].$delete({
        param: { id },
      });

      if (!res.ok) throw new Error("削除に失敗しました");

      mutate();
    } catch {
      notify("削除に失敗しました");
    } finally {
      setDeletingId(null);
    }
  };

  if (isUserLoading) return <DashboardLoading />;
  if (!user || !("role" in user) || user.role !== "ADMIN")
    return <div>管理者権限が必要です</div>;

  const accountsList: Account[] = accounts || [];

  return (
    <>
      <div className="accounts-page">
        <h1>アカウント管理</h1>

        <form onSubmit={handleCreate} className="create-form">
          <h3>新規作成</h3>
          <div className="form-row">
            <input
              type="text"
              aria-label="ユーザー名"
              placeholder="ユーザー名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <input
              type="text"
              aria-label="表示名"
              placeholder="表示名"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "作成中..." : "作成"}
            </button>
          </div>
          {error && <div className="error-message">{error}</div>}
        </form>

        <div className="accounts-list">
          <h3>アカウント一覧</h3>
          {accountsList.length === 0 ? (
            <p className="empty">アカウントがありません</p>
          ) : (
            accountsList.map((account) => (
              <div key={account.id} className="account-item">
                <div className="account-info">
                  <span className="account-name">{account.name}</span>
                  <span className="account-username">
                    {account.profiles
                      .map((profile) => `@${profile.username}`)
                      .join(" / ")}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(account.id)}
                  disabled={deletingId === account.id}
                  className="delete-btn"
                >
                  {deletingId === account.id ? "削除中..." : "削除"}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
