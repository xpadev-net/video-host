import { useAtom } from "jotai";
import { type FC, useEffect, useState } from "react";
import {
  selectedAccountIdAtom,
  selectedProfileIdAtom,
} from "@/atoms/SelectedAccount";
import { useSystemAccounts } from "@/hooks/useDashboard";
import { useSelf } from "@/hooks/useUser";
import { client } from "@/lib/client";

interface SystemAccount {
  id: string;
  username: string;
  name: string;
}

interface Profile {
  id: string;
  username: string;
  name: string;
  isDefault: boolean;
}

export const AccountSwitcher: FC = () => {
  const { data: response } = useSelf();
  // biome-ignore lint/suspicious/noExplicitAny: complex type inference
  const user = response?.status === "ok" ? (response as any).data : null;
  const isAdmin = user && "role" in user && user.role === "ADMIN";
  const { data: accounts } = useSystemAccounts();
  const [selectedAccountId, setSelectedAccountId] = useAtom(
    selectedAccountIdAtom,
  );
  const [selectedProfileId, setSelectedProfileId] = useAtom(
    selectedProfileIdAtom,
  );
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [newName, setNewName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profilesLoadError, setProfilesLoadError] = useState(false);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadProfiles = async () => {
      try {
        const res = await client.api.v4.users.profiles.$get();
        if (!res.ok) throw new Error("Profile request failed");
        const json = await res.json();
        if (!cancelled) {
          setProfiles(json.data as Profile[]);
          setProfilesLoadError(false);
        }
      } catch {
        if (!cancelled) setProfilesLoadError(true);
      }
    };
    void loadProfiles();
    const onStorage = (event: StorageEvent) => {
      if (event.key === "dashboard-selected-profile") window.location.reload();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const retryLoadProfiles = async () => {
    try {
      const res = await client.api.v4.users.profiles.$get();
      if (!res.ok) throw new Error("Profile request failed");
      const json = await res.json();
      setProfiles(json.data as Profile[]);
      setProfilesLoadError(false);
    } catch {
      setProfilesLoadError(true);
    }
  };

  useEffect(() => {
    if (
      profiles.length > 0 &&
      selectedProfileId &&
      !profiles.some((profile) => profile.id === selectedProfileId)
    ) {
      setSelectedProfileId(null);
    }
  }, [profiles, selectedProfileId, setSelectedProfileId]);

  useEffect(() => {
    if (user && !isAdmin) {
      setSelectedAccountId(null);
      return;
    }
    if (selectedAccountId && accounts) {
      const accountExists = (accounts as SystemAccount[]).some(
        (account) => account.id === selectedAccountId,
      );
      if (!accountExists) setSelectedAccountId(null);
    }
  }, [selectedAccountId, accounts, setSelectedAccountId, isAdmin, user]);

  const systemAccounts = (accounts as SystemAccount[]) || [];
  const selectedAccount = selectedAccountId
    ? systemAccounts.find((account) => account.id === selectedAccountId)
    : null;

  const handleProfileChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setSelectedProfileId(value || null);
    window.location.reload();
  };

  const handleCreateProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setProfileError(null);
    setIsCreatingProfile(true);
    try {
      const res = await client.api.v4.users.profiles.$post({
        json: { name: newName, username: newUsername },
      });
      if (!res.ok) {
        setProfileError(
          "作成できませんでした。ユーザー名の重複がないか確認してください。",
        );
        return;
      }
      const profile = (await res.json()).data as Profile;
      setProfiles((current) => [...current, profile]);
      setNewName("");
      setNewUsername("");
      setSelectedProfileId(profile.id);
      window.location.reload();
    } catch {
      setProfileError("プロフィールを作成できませんでした。");
    } finally {
      setIsCreatingProfile(false);
    }
  };

  return (
    <div className="account-switcher">
      {profilesLoadError && (
        <p role="alert">
          プロフィールを読み込めませんでした。{" "}
          <button type="button" onClick={retryLoadProfiles}>
            再試行
          </button>
        </p>
      )}
      {profiles.length > 0 && (
        <>
          <label htmlFor="profile-select" className="account-switcher-label">
            プロフィール
          </label>
          <select
            id="profile-select"
            value={selectedProfileId || ""}
            onChange={handleProfileChange}
            className="account-switcher-select"
          >
            {profiles.map((profile) => (
              <option
                key={profile.id}
                value={profile.isDefault ? "" : profile.id}
              >
                {profile.name}
                {profile.isDefault ? "（デフォルト）" : ""} @{profile.username}
              </option>
            ))}
          </select>
          <form
            className="mt-3 flex flex-col gap-2"
            onSubmit={handleCreateProfile}
          >
            <input
              aria-label="プロフィール表示名"
              placeholder="表示名"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              maxLength={191}
              required
            />
            <input
              aria-label="プロフィールユーザー名"
              placeholder="ユーザー名（3〜32文字）"
              value={newUsername}
              onChange={(event) => setNewUsername(event.target.value)}
              pattern="[A-Za-z0-9_-]{3,32}"
              required
            />
            <button type="submit" disabled={isCreatingProfile}>
              {isCreatingProfile ? "作成中..." : "プロフィールを追加"}
            </button>
            {profileError && <p role="alert">{profileError}</p>}
          </form>
        </>
      )}
      {isAdmin && (
        <>
          <label htmlFor="account-select" className="account-switcher-label">
            表示アカウント
          </label>
          <select
            id="account-select"
            value={selectedAccountId || ""}
            onChange={(event) =>
              setSelectedAccountId(event.target.value || null)
            }
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
        </>
      )}
    </div>
  );
};
