import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { DashboardLayout } from "@/components/Dashboard/DashboardLayout";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_app/dashboard")({
  beforeLoad: async ({ location }) => {
    const { data, error } = await authClient.getSession();
    if (error) throw new Error("ログイン状態を確認できませんでした");
    if (!data?.user) {
      throw redirect({
        to: "/login",
        search: { callback: `${location.pathname}${location.searchStr}` },
      });
    }
  },
  component: DashboardRoute,
});

function DashboardRoute() {
  return (
    <DashboardLayout>
      <Outlet />
    </DashboardLayout>
  );
}
