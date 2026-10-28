import { createFileRoute } from "@tanstack/react-router";
import type { InvitationSummary } from "@video-host/backend";
import { useState } from "react";
import { useInvitations } from "@/hooks/useInvitations";
import { useProfiles } from "@/hooks/useProfiles";
import { client } from "@/lib/client";

export const Route = createFileRoute("/_app/dashboard/invitations")({
  head: () => ({ meta: [{ title: "招待" }] }),
  component: InvitationsPage,
});

function ReceivedInvitation({ invitation }: { invitation: InvitationSummary }) {
  const { data: profiles } = useProfiles();
  const { mutate } = useInvitations();
  const [profileId, setProfileId] = useState("");
  const [pending, setPending] = useState(false);

  const handleAccept = async () => {
    if (!profileId) return;
    setPending(true);
    try {
      const res = await client.api.v4.invitations[":id"].accept.$post({
        param: { id: invitation.id },
        json: { profileId },
      });
      if (res.ok) await mutate();
    } finally {
      setPending(false);
    }
  };

  const handleDecline = async () => {
    setPending(true);
    try {
      const res = await client.api.v4.invitations[":id"].decline.$post({
        param: { id: invitation.id },
      });
      if (res.ok) await mutate();
    } finally {
      setPending(false);
    }
  };

  return (
    <li className="bg-thirdly-background border-border flex flex-col gap-3 rounded-xl border p-4">
      <div>
        <span className="font-medium">{invitation.inviter?.name}</span>
        <span className="text-text">
          {" "}
          から「{invitation.targetLabel}」への招待
        </span>
        <span className="text-sub-text">
          {" "}
          （{invitation.targetType === "MOVIE" ? "動画" : "プロフィール"}）
        </span>
      </div>
      {invitation.status === "PENDING" ? (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={profileId}
            onChange={(event) => setProfileId(event.target.value)}
            className="border-border bg-background text-text rounded-lg border px-3 py-1.5 text-sm"
          >
            <option value="">プロフィールを選択</option>
            {(profiles ?? []).map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name} @{profile.username}
                {profile.isDefault ? "（デフォルト）" : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void handleAccept()}
            disabled={!profileId || pending}
          >
            承諾
          </button>
          <button
            type="button"
            onClick={() => void handleDecline()}
            disabled={pending}
          >
            辞退
          </button>
        </div>
      ) : (
        <span className="text-sub-text text-sm">
          {invitation.status === "ACCEPTED" ? "承諾済み" : "辞退済み"}
        </span>
      )}
    </li>
  );
}

function InvitationsPage() {
  const { data, mutate } = useInvitations();
  const received = data?.received ?? [];
  const sent = data?.sent ?? [];

  const handleCancel = async (id: string) => {
    const res = await client.api.v4.invitations[":id"].$delete({
      param: { id },
    });
    if (res.ok) await mutate();
  };

  return (
    <div className="mx-auto max-w-[800px] space-y-8 p-6">
      <h1 className="text-2xl font-bold">招待</h1>

      <section>
        <h2 className="mb-3 text-lg font-semibold">受信した招待</h2>
        {received.length === 0 ? (
          <p className="text-sub-text">招待はありません</p>
        ) : (
          <ul className="space-y-3">
            {received.map((invitation) => (
              <ReceivedInvitation key={invitation.id} invitation={invitation} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">送信した招待</h2>
        {sent.length === 0 ? (
          <p className="text-sub-text">招待はありません</p>
        ) : (
          <ul className="space-y-3">
            {sent.map((invitation) => (
              <li
                key={invitation.id}
                className="bg-thirdly-background border-border flex flex-col gap-2 rounded-xl border p-4"
              >
                <div>
                  <span>
                    「{invitation.targetLabel}」→ {invitation.invitee?.name}
                  </span>
                  <span className="text-sub-text">
                    {" "}
                    {invitation.status === "PENDING"
                      ? "招待中"
                      : invitation.status === "ACCEPTED"
                        ? `承諾済み（${invitation.grantedProfile?.name}）`
                        : "辞退済み"}
                  </span>
                </div>
                {invitation.status === "PENDING" && (
                  <button
                    type="button"
                    className="self-start"
                    onClick={() => void handleCancel(invitation.id)}
                  >
                    取消
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
