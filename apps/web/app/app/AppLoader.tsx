"use client";

import dynamic from "next/dynamic";

/** The wallet connector needs window/localStorage, so the app renders in the browser only. */
export const AppLoader = dynamic(() => import("./EvergreenApp").then((m) => m.EvergreenApp), {
  ssr: false,
  loading: () => <main className="app" aria-busy="true" />,
});
