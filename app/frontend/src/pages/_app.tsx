import "@/styles/global.css";
import "@/styles/nprogress.css";
import "@radix-ui/themes/styles.css";

import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import NProgress from "nprogress";
import { useEffect, useRef } from "react";

import { App } from "@/components/App";
import { PipPlayer } from "@/components/Player/PipPlayer";
import { PortalPlayer } from "@/components/Player/PortalPlayer";
import { Theme } from "@/components/Theme";

export default function Main({ Component, pageProps }: AppProps) {
  const router = useRouter();

  const fallbackVideoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleStart = () => {
      NProgress.start();
    };
    const handleStop = () => {
      NProgress.done();
    };

    router.events.on("routeChangeStart", handleStart);
    router.events.on("routeChangeComplete", handleStop);
    router.events.on("routeChangeError", handleStop);

    return () => {
      router.events.off("routeChangeStart", handleStart);
      router.events.off("routeChangeComplete", handleStop);
      router.events.off("routeChangeError", handleStop);
    };
  }, [router]);

  /* Removed requests.defaults.headers.Authorization assignment as requests is removed. 
     Auth headers should be handled by client or per-request. */

  return (
    <Theme>
      <App>
        <Component {...pageProps} />
        <PipPlayer />
        <PortalPlayer fallback={fallbackVideoRef.current} />
        <div ref={fallbackVideoRef} className="hidden" />
      </App>
    </Theme>
  );
}
