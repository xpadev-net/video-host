import axios from "axios";
import { useAtomValue } from "jotai";
import Head from "next/head";
import { type FC, type FormEvent, useState } from "react";
import { AuthTokenAtom } from "@/atoms/Auth";
import { DashboardLayout } from "@/components/Dashboard/DashboardLayout";
import { useSystemAccounts } from "@/hooks/useDashboard";
import { useSelf } from "@/hooks/useUser";

const API_URL = process.env.NEXT_PUBLIC_API_ENDPOINT || "";

interface SystemAccount {
  id: string;
  username: string;
  name: string;
  createdAt: string;
}

const SystemAccountsPage: FC = () => {
  const token = useAtomValue(AuthTokenAtom);
  const { data: response, isLoading: isUserLoading } = useSelf();
  const user = response?.status === "ok" ? response.data : null;
  const { data: accounts, mutate } = useSystemAccounts();
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
      await axios.post(
        `${API_URL}/system-accounts`,
        { username: username.trim(), name: name.trim() },
        { headers: { Authorization: `Bearer ${token}` } },
      );
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
      !confirm(
        "このシステムアカウントを削除しますか？関連するコンテンツも削除されます。",
      )
    )
      return;

    setDeletingId(id);
    try {
      await axios.delete(`${API_URL}/system-accounts/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      mutate();
    } catch {
      alert("削除に失敗しました");
    } finally {
      setDeletingId(null);
    }
  };

  if (isUserLoading)
    return (
      <DashboardLayout>
        <div>Loading...</div>
      </DashboardLayout>
    );
  if (!user || !("role" in user) || user.role !== "ADMIN")
    return (
      <DashboardLayout>
        <div>管理者権限が必要です</div>
      </DashboardLayout>
    );

  const accountsList: SystemAccount[] = accounts || [];

  return (
    <DashboardLayout>
      <Head>
        <title>システムアカウント管理</title>
      </Head>
      <div className="system-accounts-page">
        <h1>システムアカウント管理</h1>

        <form onSubmit={handleCreate} className="create-form">
          <h3>新規作成</h3>
          <div className="form-row">
            <input
              type="text"
              placeholder="ユーザー名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <input
              type="text"
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
            <p className="empty">システムアカウントがありません</p>
          ) : (
            accountsList.map((account) => (
              <div key={account.id} className="account-item">
                <div className="account-info">
                  <span className="account-name">{account.name}</span>
                  <span className="account-username">@{account.username}</span>
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
      <style jsx>{`
        .system-accounts-page h1 { color: var(--text-primary, #fff); margin-bottom: 2rem; }
        .create-form { background: var(--background-primary, #0d0d0d); padding: 1.5rem; border-radius: 12px; margin-bottom: 2rem; }
        .create-form h3 { color: var(--text-primary, #fff); margin: 0 0 1rem; }
        .form-row { display: flex; gap: 1rem; }
        .form-row input { flex: 1; padding: 0.75rem; background: var(--background-secondary, #1a1a1a); border: 1px solid var(--border-color, #333); border-radius: 8px; color: var(--text-primary, #fff); }
        .form-row button { padding: 0.75rem 1.5rem; background: var(--primary-color, #3b82f6); color: white; border: none; border-radius: 8px; cursor: pointer; }
        .form-row button:disabled { opacity: 0.5; cursor: not-allowed; }
        .error-message { margin-top: 1rem; padding: 0.75rem; background: rgba(239, 68, 68, 0.1); border: 1px solid #ef4444; border-radius: 8px; color: #ef4444; }
        .accounts-list h3 { color: var(--text-primary, #fff); margin-bottom: 1rem; }
        .empty { color: var(--text-secondary, #999); }
        .account-item { display: flex; justify-content: space-between; align-items: center; padding: 1rem; background: var(--background-primary, #0d0d0d); border: 1px solid var(--border-color, #333); border-radius: 8px; margin-bottom: 0.5rem; }
        .account-info { display: flex; flex-direction: column; gap: 0.25rem; }
        .account-name { color: var(--text-primary, #fff); }
        .account-username { color: var(--text-secondary, #999); font-size: 0.875rem; }
        .delete-btn { padding: 0.5rem 1rem; background: transparent; border: 1px solid #ef4444; border-radius: 6px; color: #ef4444; cursor: pointer; }
        .delete-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </DashboardLayout>
  );
};

export default SystemAccountsPage;
