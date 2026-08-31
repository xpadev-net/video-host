import {
  createFileRoute,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import NProgress from "nprogress";
import { useEffect, useRef } from "react";

import { App } from "@/components/App";
import { PipPlayer } from "@/components/Player/PipPlayer";
import { PortalPlayer } from "@/components/Player/PortalPlayer";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const isLoading = useRouterState({ select: (state) => state.isLoading });
  const fallbackVideoRef = useRef<HTMLDivElement>(null);

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
      <Outlet />
      <PipPlayer />
      <PortalPlayer fallback={fallbackVideoRef.current} />
      <div ref={fallbackVideoRef} className="hidden" />
    </App>
  );
}
