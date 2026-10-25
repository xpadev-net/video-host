import { atomWithStorage } from "jotai/utils";

// Selected account ID for admin account switching
// null = self (admin's own account)
// string = system account ID
export const selectedAccountIdAtom = atomWithStorage<string | null>(
  "dashboard-selected-account",
  null,
);

// Profile identity for normal account actions; null selects the account's
// default profile. The API validates this browser-local selection per request.
export const selectedProfileIdAtom = atomWithStorage<string | null>(
  "dashboard-selected-profile",
  null,
);
