import type { FilteredUser, Visibility } from "@video-host/backend";
import { useState } from "react";
import { ViewerManager } from "@/components/Dashboard/ViewerManager";
import { client } from "@/lib/client";

type Props = {
  profile: FilteredUser;
  selectedProfileId: string | null;
  onSaved: () => void;
};

export const ProfileVisibilityEditor: React.FC<Props> = ({
  profile,
  selectedProfileId,
  onSaved,
}) => {
  const [visibility, setVisibility] = useState<Visibility>(
    profile.visibility ?? "PUBLIC",
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isShareable = visibility === "LIMITED" || visibility === "PRIVATE";

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await client.api.v4.users.me.$patch(
        { json: { visibility } },
        { headers: { "X-Profile-Id": selectedProfileId ?? "" } },
      );
      if (!res.ok) throw new Error("Failed to save");
      onSaved();
    } catch {
      setError("公開設定を保存できませんでした");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-2">
      <label htmlFor="profile-visibility" className="account-switcher-label">
        プロフィール公開設定
      </label>
      <select
        id="profile-visibility"
        value={visibility}
        onChange={(event) => setVisibility(event.target.value as Visibility)}
        className="account-switcher-select"
      >
        <option value="PUBLIC">公開</option>
        <option value="UNLISTED">限定公開</option>
        <option value="LIMITED">指定ユーザー公開</option>
        <option value="PRIVATE">非公開</option>
      </select>
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={isSaving}
      >
        {isSaving ? "保存中..." : "公開設定を保存"}
      </button>
      {error && <p role="alert">{error}</p>}
      {isShareable && (
        <ViewerManager
          targetType="PROFILE"
          targetId={profile.id}
          viewers={profile.viewers ?? []}
        />
      )}
    </div>
  );
};
