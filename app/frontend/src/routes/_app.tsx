import {
  createFileRoute,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import NProgress from "nprogress";
import { useEffect } from "react";

import { App } from "@/components/App";
import { PipPlayer } from "@/components/Player/PipPlayer";
import { PortalPlayer } from "@/components/Player/PortalPlayer";
import { ProfileChangeWatcher } from "@/components/Player/ProfileChangeWatcher";

NProgress.configure({
  showSpinner: false,
  minimum: 0.1,
  easing: "ease",
  speed: 200,
});

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const isLoading = useRouterState({ select: (state) => state.isLoading });

  useEffect(() => {
    if (isLoading) {
      NProgress.start();
    } else {
      NProgress.done();
    }

    return () => {
      NProgress.done();
    };
  }, [isLoading]);

  return (
    <App>
      <ProfileChangeWatcher />
      <Outlet />
      <PipPlayer />
      <PortalPlayer />
    </App>
  );
}
