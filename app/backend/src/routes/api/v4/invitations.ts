import { zValidator } from "@hono/zod-validator";
import type { AccessInvitation } from "@prisma/client";
import { Hono } from "hono";
import { z } from "zod";
import type { Env, HonoApp } from "@/@types/hono";
import type { InvitationSummary } from "@/@types/models";
import { filterUser } from "@/lib/filter";
import { prisma } from "@/lib/prisma";
import { canManageOwned } from "@/utils/movieAuth";
import {
  badRequest,
  forbidden,
  notFound,
  unauthorized,
} from "@/utils/response";
import { ok } from "@/utils/response/ok";

const app = new Hono<Env>();

const CreateInvitationSchema = z.object({
  targetType: z.enum(["MOVIE", "PROFILE"]),
  targetId: z.string(),
  inviteeUserId: z.string(),
});

const AcceptInvitationSchema = z.object({
  profileId: z.string(),
});

// Resolve the account (authUserId) behind a public profile id picked from the
// user search: the profile's own authUserId (default profile) or, for an
// additional profile, the account it belongs to.
async function resolveInviteeAccount(
  inviteeUserId: string,
): Promise<string | null> {
  const target = await prisma.user.findUnique({ where: { id: inviteeUserId } });
  if (!target) return null;
  if (target.authUserId) return target.authUserId;
  const membership = await prisma.authProfile.findUnique({
    where: { profileId: inviteeUserId },
  });
  return membership?.authUserId ?? null;
}

// Profile ids owned by an account: its default profile plus additional ones.
async function accountProfileIds(authUserId: string): Promise<string[]> {
  const [profile, memberships] = await Promise.all([
    prisma.user.findUnique({ where: { authUserId } }),
    prisma.authProfile.findMany({
      where: { authUserId },
      select: { profileId: true },
    }),
  ]);
  const ids = memberships.map((membership) => membership.profileId);
  if (profile) ids.unshift(profile.id);
  return ids;
}

// Whether the target still accepts viewer grants. A movie must be LIMITED; a
// profile must be non-public (LIMITED or PRIVATE) so it can be shared.
async function targetIsShareable(
  targetType: "MOVIE" | "PROFILE",
  targetId: string,
): Promise<boolean> {
  if (targetType === "MOVIE") {
    const movie = await prisma.movie.findUnique({
      where: { id: targetId },
      select: { visibility: true },
    });
    return movie?.visibility === "LIMITED";
  }
  const profile = await prisma.user.findUnique({
    where: { id: targetId },
    select: { visibility: true },
  });
  return profile?.visibility === "LIMITED" || profile?.visibility === "PRIVATE";
}

async function buildSummaries(
  invitations: AccessInvitation[],
  direction: "received" | "sent",
): Promise<InvitationSummary[]> {
  const movieIds = invitations
    .filter((invitation) => invitation.targetType === "MOVIE")
    .map((invitation) => invitation.targetId);
  const profileIds = invitations
    .filter((invitation) => invitation.targetType === "PROFILE")
    .map((invitation) => invitation.targetId);
  const inviterIds = [...new Set(invitations.map((i) => i.inviterId))];
  const inviteeAuthIds = [
    ...new Set(invitations.map((i) => i.inviteeAuthUserId)),
  ];
  const grantedIds = [
    ...new Set(
      invitations
        .map((i) => i.grantedProfileId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [movies, targetProfiles, inviters, inviteeDefaults, grantedProfiles] =
    await Promise.all([
      movieIds.length
        ? prisma.movie.findMany({
            where: { id: { in: movieIds } },
            select: { id: true, title: true },
          })
        : Promise.resolve([]),
      profileIds.length
        ? prisma.user.findMany({ where: { id: { in: profileIds } } })
        : Promise.resolve([]),
      inviterIds.length
        ? prisma.user.findMany({ where: { id: { in: inviterIds } } })
        : Promise.resolve([]),
      inviteeAuthIds.length
        ? prisma.user.findMany({
            where: { authUserId: { in: inviteeAuthIds } },
          })
        : Promise.resolve([]),
      grantedIds.length
        ? prisma.user.findMany({ where: { id: { in: grantedIds } } })
        : Promise.resolve([]),
    ]);

  const movieLabel = new Map(movies.map((movie) => [movie.id, movie.title]));
  const profileLabel = new Map(
    targetProfiles.map((profile) => [profile.id, profile.name]),
  );
  const inviterById = new Map(inviters.map((user) => [user.id, user]));
  const defaultByAuthId = new Map(
    inviteeDefaults.map((user) => [user.authUserId as string, user]),
  );
  const grantedById = new Map(grantedProfiles.map((user) => [user.id, user]));

  return invitations.map((invitation) => {
    const targetLabel =
      invitation.targetType === "MOVIE"
        ? (movieLabel.get(invitation.targetId) ?? "Unknown movie")
        : (profileLabel.get(invitation.targetId) ?? "Unknown profile");
    const base = {
      id: invitation.id,
      status: invitation.status,
      targetType: invitation.targetType,
      targetId: invitation.targetId,
      targetLabel,
      createdAt: invitation.createdAt.toISOString(),
    };
    if (direction === "received") {
      const inviter = inviterById.get(invitation.inviterId);
      return {
        ...base,
        inviter: inviter ? filterUser(inviter) : undefined,
      };
    }
    const inviteeDefault = defaultByAuthId.get(invitation.inviteeAuthUserId);
    const granted = invitation.grantedProfileId
      ? grantedById.get(invitation.grantedProfileId)
      : undefined;
    return {
      ...base,
      invitee: inviteeDefault ? filterUser(inviteeDefault) : undefined,
      grantedProfile: granted ? filterUser(granted) : undefined,
    };
  });
}

export const invitationsRoute = app
  .post("/", zValidator("json", CreateInvitationSchema), async (c) => {
    const user = c.get("user");
    const authUserId = c.get("authUserId");
    if (!user || !authUserId) unauthorized("Unauthorized");

    const { targetType, targetId, inviteeUserId } = c.req.valid("json");

    const inviteeAuthUserId = await resolveInviteeAccount(inviteeUserId);
    if (!inviteeAuthUserId) badRequest("Invitee not found");
    if (inviteeAuthUserId === authUserId)
      badRequest("Cannot invite your own account");

    // Validate the target and that the caller may share it. The target's
    // visibility is re-checked at acceptance, so a grant can be prepared
    // before the movie/profile is finalized as shareable.
    let inviterId: string;
    let targetLabel: string;
    if (targetType === "MOVIE") {
      const movie = await prisma.movie.findUnique({ where: { id: targetId } });
      if (!movie) notFound("Movie not found");
      if (!(await canManageOwned(user, movie.authorId)))
        forbidden("Not authorized to share this movie");
      inviterId = movie.authorId;
      targetLabel = movie.title;
    } else {
      const profile = await prisma.user.findUnique({ where: { id: targetId } });
      if (!profile) notFound("Profile not found");
      const owned = (await accountProfileIds(authUserId)).includes(profile.id);
      if (!owned) forbidden("Not authorized to share this profile");
      inviterId = profile.id;
      targetLabel = profile.name;
    }

    const duplicate = await prisma.accessInvitation.findFirst({
      where: {
        targetType,
        targetId,
        inviteeAuthUserId,
        status: "PENDING",
      },
    });
    if (duplicate) badRequest("Already invited this user");

    const invitation = await prisma.accessInvitation.create({
      data: { inviterId, inviteeAuthUserId, targetType, targetId },
    });

    return ok(c, {
      id: invitation.id,
      status: invitation.status,
      targetType: invitation.targetType,
      targetId: invitation.targetId,
      targetLabel,
      createdAt: invitation.createdAt.toISOString(),
    });
  })
  .get("/", async (c) => {
    const user = c.get("user");
    const authUserId = c.get("authUserId");
    if (!user || !authUserId) unauthorized("Unauthorized");

    const profileIds = await accountProfileIds(authUserId);
    const [received, sent] = await Promise.all([
      prisma.accessInvitation.findMany({
        where: { inviteeAuthUserId: authUserId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.accessInvitation.findMany({
        where: { inviterId: { in: profileIds } },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const [receivedSummaries, sentSummaries] = await Promise.all([
      buildSummaries(received, "received"),
      buildSummaries(sent, "sent"),
    ]);

    return ok(c, { received: receivedSummaries, sent: sentSummaries });
  })
  .post(
    "/:id/accept",
    zValidator("json", AcceptInvitationSchema),
    async (c) => {
      const user = c.get("user");
      const authUserId = c.get("authUserId");
      if (!user || !authUserId) unauthorized("Unauthorized");

      const id = c.req.param("id");
      const { profileId } = c.req.valid("json");

      const invitation = await prisma.accessInvitation.findUnique({
        where: { id },
      });
      if (!invitation || invitation.inviteeAuthUserId !== authUserId)
        notFound("Invitation not found");
      if (invitation.status !== "PENDING")
        badRequest("Invitation already handled");

      const ownedIds = await accountProfileIds(authUserId);
      if (!ownedIds.includes(profileId))
        badRequest("Profile does not belong to your account");

      if (
        !(await targetIsShareable(invitation.targetType, invitation.targetId))
      )
        badRequest("Invitation is no longer valid");

      await prisma.$transaction(async (tx) => {
        if (invitation.targetType === "MOVIE") {
          await tx.movieViewer.upsert({
            where: {
              movieId_userId: {
                movieId: invitation.targetId,
                userId: profileId,
              },
            },
            create: { movieId: invitation.targetId, userId: profileId },
            update: {},
          });
        } else {
          await tx.profileViewer.upsert({
            where: {
              profileId_userId: {
                profileId: invitation.targetId,
                userId: profileId,
              },
            },
            create: { profileId: invitation.targetId, userId: profileId },
            update: {},
          });
        }
        await tx.accessInvitation.update({
          where: { id },
          data: { status: "ACCEPTED", grantedProfileId: profileId },
        });
      });

      return ok(c, { success: true });
    },
  )
  .post("/:id/decline", async (c) => {
    const user = c.get("user");
    const authUserId = c.get("authUserId");
    if (!user || !authUserId) unauthorized("Unauthorized");

    const id = c.req.param("id");
    const invitation = await prisma.accessInvitation.findUnique({
      where: { id },
    });
    if (!invitation || invitation.inviteeAuthUserId !== authUserId)
      notFound("Invitation not found");
    if (invitation.status !== "PENDING")
      badRequest("Invitation already handled");

    await prisma.accessInvitation.update({
      where: { id },
      data: { status: "DECLINED" },
    });
    return ok(c, { success: true });
  })
  .delete("/:id", async (c) => {
    const user = c.get("user");
    const authUserId = c.get("authUserId");
    if (!user || !authUserId) unauthorized("Unauthorized");

    const id = c.req.param("id");
    const invitation = await prisma.accessInvitation.findUnique({
      where: { id },
    });
    if (!invitation) notFound("Invitation not found");

    const profileIds = await accountProfileIds(authUserId);
    if (!profileIds.includes(invitation.inviterId))
      forbidden("Not authorized to cancel this invitation");
    if (invitation.status !== "PENDING")
      badRequest("Invitation already handled");

    await prisma.accessInvitation.delete({ where: { id } });
    return ok(c, { success: true });
  });

export const registerInvitationsRoute = (app: HonoApp) => {
  app.route("/invitations", invitationsRoute);
};
