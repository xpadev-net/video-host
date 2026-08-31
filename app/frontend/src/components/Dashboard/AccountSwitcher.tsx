import { useAtom } from "jotai";
import { type FC, useEffect } from "react";
import { selectedAccountIdAtom } from "@/atoms/SelectedAccount";
import { useSystemAccounts } from "@/hooks/useDashboard";
import { useSelf } from "@/hooks/useUser";

interface SystemAccount {
  id: string;
  username: string;
  name: string;
}

export const AccountSwitcher: FC = () => {
  const { data: response } = useSelf();
  // biome-ignore lint/suspicious/noExplicitAny: complex type inference
  const user = response?.status === "ok" ? (response as any).data : null;
  const isAdmin = user && "role" in user && user.role === "ADMIN";
  console.log(isAdmin);

  const { data: accounts } = useSystemAccounts();
  const [selectedAccountId, setSelectedAccountId] = useAtom(
    selectedAccountIdAtom,
  );

  // Reset selected account if it's no longer valid
  useEffect(() => {
    if (selectedAccountId && accounts) {
      const accountExists = (accounts as SystemAccount[]).some(
        (acc) => acc.id === selectedAccountId,
      );
      if (!accountExists) {
        setSelectedAccountId(null);
      }
    }
  }, [selectedAccountId, accounts, setSelectedAccountId]);

  if (!isAdmin) {
    return null;
  }

  const systemAccounts = (accounts as SystemAccount[]) || [];

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedAccountId(value === "" ? null : value);
  };

  const selectedAccount = selectedAccountId
    ? systemAccounts.find((acc) => acc.id === selectedAccountId)
    : null;

  return (
    <div className="account-switcher">
      <label htmlFor="account-select" className="account-switcher-label">
        表示アカウント
      </label>
      <select
        id="account-select"
        value={selectedAccountId || ""}
        onChange={handleChange}
        className="account-switcher-select"
      >
        <option value="">👤 {user?.name}（自分）</option>
        {systemAccounts.map((account) => (
          <option key={account.id} value={account.id}>
            🤖 {account.name}
          </option>
        ))}
      </select>
      {selectedAccount && (
        <div className="account-switcher-note">
          @{selectedAccount.username} として表示中
        </div>
      )}
    </div>
  );
};
