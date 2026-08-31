import { createFileRoute, Outlet } from "@tanstack/react-router";

import { DashboardLayout } from "@/components/Dashboard/DashboardLayout";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardRoute,
});

function DashboardRoute() {
  return (
    <DashboardLayout>
      <Outlet />
    </DashboardLayout>
  );
}
