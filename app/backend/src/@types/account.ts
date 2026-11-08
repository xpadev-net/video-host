import type { User as Profile, Role } from "@prisma/client";

// Permissions belong to the authenticated account, never the selected profile.
export type User = Profile & { role: Role };
