import type { FilteredUser } from "@video-host/backend";
import { useState } from "react";
import { UserPicker } from "@/components/UserPicker/UserPicker";
import { useInvitations } from "@/hooks/useInvitations";
import { client } from "@/lib/client";

type Props = {
  targetType: "MOVIE" | "PROFILE";
  targetId: string;
  viewers: FilteredUser[];
};

export const ViewerManager: React.FC<Props> = ({
  targetType,
  targetId,
  viewers,
}) => {
  const { data: invitations, mutate: mutateInvitations } = useInvitations();
  const [selected, setSelected] = useState<FilteredUser[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pending = (invitations?.sent ?? []).filter(
    (invitation) =>
      invitation.targetType === targetType &&
      invitation.targetId === targetId &&
      invitation.status === "PENDING",
  );

  const handleInvite = async () => {
    if (selected.length === 0) return;
    setIsSending(true);
    setError(null);
    try {
      for (const user of selected) {
        const res = await client.api.v4.invitations.$post({
          json: { targetType, targetId, inviteeUserId: user.id },
        });
        if (!res.ok) throw new Error("Failed to invite");
      }
      setSelected([]);
      await mutateInvitations();
    } catch {
      setError("招待を送信できませんでした");
    } finally {
      setIsSending(false);
    }
  };

  const handleCancel = async (invitationId: string) => {
    const res = await client.api.v4.invitations[":id"].$delete({
      param: { id: invitationId },
    });
    if (res.ok) await mutateInvitations();
  };

  return (
    <div className="flex flex-col gap-2">
      {viewers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {viewers.map((viewer) => (
            <span
              key={viewer.id}
              className="bg-thirdly-background border-border text-text inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm"
            >
              {viewer.name}{" "}
              <span className="text-sub-text">@{viewer.username}</span>
            </span>
          ))}
        </div>
      )}
      {pending.map((invitation) => (
        <div
          key={invitation.id}
          className="bg-thirdly-background border-border flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-sm"
        >
          <span className="text-sub-text">
            {invitation.invitee?.name}（招待中）
          </span>
          <button
            type="button"
            className="text-sub-text hover:text-text cursor-pointer text-xs"
            onClick={() => void handleCancel(invitation.id)}
          >
            取消
          </button>
        </div>
      ))}
      <UserPicker
        id={`${targetType}-${targetId}-viewers`}
        selected={selected}
        onChange={setSelected}
      />
      <button
        type="button"
        onClick={() => void handleInvite()}
        disabled={selected.length === 0 || isSending}
      >
        {isSending ? "送信中..." : "招待する"}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
};
