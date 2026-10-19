import type { InferResponseType } from "hono";
import { useAtom } from "jotai";
import { type FC, useEffect, useRef, useState } from "react";
import {
  selectedAccountIdAtom,
  selectedProfileIdAtom,
} from "@/atoms/SelectedAccount";
import { useSystemAccounts } from "@/hooks/useDashboard";
import { useProfiles } from "@/hooks/useProfiles";
import { useSelf } from "@/hooks/useUser";
import { client } from "@/lib/client";

type SystemAccount = InferResponseType<
  (typeof client.api.v4)["system-accounts"]["$get"]
>["data"][number];

export const AccountSwitcher: FC = () => {
  const { data: user } = useSelf();
  const isAdmin = user && "role" in user && user.role === "ADMIN";
  const { data: accounts } = useSystemAccounts(Boolean(isAdmin));
  const {
    data: profiles,
    error: profilesLoadError,
    mutate: mutateProfiles,
  } = useProfiles();
  const [selectedAccountId, setSelectedAccountId] = useAtom(
    selectedAccountIdAtom,
  );
  const [selectedProfileId, setSelectedProfileId] = useAtom(
    selectedProfileIdAtom,
  );
  const refreshingUnknownProfilesRef = useRef(new Set<string>());
  const [newName, setNewName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);

  const profileList = profiles ?? [];

  useEffect(() => {
    if (!selectedProfileId || !profiles) return;
    const selectedProfile = profiles.find(
      (profile) => profile.id === selectedProfileId,
    );
    if (selectedProfile?.isDefault) {
      setSelectedProfileId(null);
      return;
    }
    if (selectedProfile || profilesLoadError) return;
    if (refreshingUnknownProfilesRef.current.has(selectedProfileId)) return;
    refreshingUnknownProfilesRef.current.add(selectedProfileId);
    void mutateProfiles()
      .then((refreshedProfiles) => {
        if (
          refreshedProfiles?.some((profile) => profile.id === selectedProfileId)
        )
          return;
        setSelectedProfileId((current) =>
          current === selectedProfileId ? null : current,
        );
      })
      .catch(() => {
        // Keep the stored selection when a refresh fails; it may be valid.
      })
      .finally(() => {
        refreshingUnknownProfilesRef.current.delete(selectedProfileId);
      });
  }, [
    profiles,
    profilesLoadError,
    selectedProfileId,
    setSelectedProfileId,
    mutateProfiles,
  ]);

  useEffect(() => {
    if (user && !isAdmin) {
      setSelectedAccountId(null);
      return;
    }
    if (selectedAccountId && accounts) {
      const accountExists = (accounts ?? []).some(
        (account) => account.id === selectedAccountId,
      );
      if (!accountExists) setSelectedAccountId(null);
    }
  }, [selectedAccountId, accounts, setSelectedAccountId, isAdmin, user]);

  const systemAccounts: SystemAccount[] = accounts ?? [];
  const selectedAccount = selectedAccountId
    ? systemAccounts.find((account) => account.id === selectedAccountId)
    : null;
  const selectedProfile = profileList.find(
    (profile) => profile.id === selectedProfileId,
  );
  const profileSelectValue =
    selectedProfile && !selectedProfile.isDefault ? selectedProfile.id : "";

  const handleProfileChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    const nextProfileId = value || null;
    setSelectedProfileId(nextProfileId);
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
      const profile = (await res.json()).data;
      await mutateProfiles((current) => [...(current ?? []), profile], {
        revalidate: false,
      });
      setNewName("");
      setNewUsername("");
      setSelectedProfileId(profile.id);
    } catch {
      setProfileError("プロフィールを作成できませんでした。");
    } finally {
      setIsCreatingProfile(false);
    }
  };

  return (
    <div className="account-switcher">
      {profilesLoadError && !profiles && (
        <p role="alert">
          プロフィールを読み込めませんでした。{" "}
          <button type="button" onClick={() => void mutateProfiles()}>
            再試行
          </button>
        </p>
      )}
      {profileList.length > 0 && (
        <>
          <label htmlFor="profile-select" className="account-switcher-label">
            プロフィール
          </label>
          <select
            id="profile-select"
            value={profileSelectValue}
            onChange={handleProfileChange}
            className="account-switcher-select"
          >
            {profileList.map((profile) => (
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
            onChange={(event) => {
              setSelectedAccountId(event.target.value || null);
              setSelectedProfileId(null);
            }}
            className="account-switcher-select"
          >
            <option value="">{user?.name}（自分）</option>
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
