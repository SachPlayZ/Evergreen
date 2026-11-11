"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { DemoJson, MainnetJson } from "@/lib/format";

interface LiveData {
  /** undefined while the first read is in flight. */
  demo?: DemoJson;
  /** When `demo` was read, so countdowns can tick between polls. */
  demoAt: number;
  mainnet?: MainnetJson;
  mainnetFailed: boolean;
  retryMainnet: () => void;
  now: number;
}

const Ctx = createContext<LiveData>({ demoAt: 0, mainnetFailed: false, retryMainnet: () => {}, now: 0 });
export const useLive = () => useContext(Ctx);

/** One poll of the demo network and one read of mainnet, shared by every section. */
export function LiveProvider({ children }: { children: ReactNode }) {
  const [demo, setDemo] = useState<{ data: DemoJson; at: number }>();
  const [mainnet, setMainnet] = useState<MainnetJson>();
  const [mainnetFailed, setMainnetFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let stop = false;
    const read = async () => {
      let data: DemoJson;
      try {
        data = await (await fetch("/api/demo", { cache: "no-store" })).json();
      } catch {
        data = { configured: false };
      }
      if (!stop) setDemo({ data, at: Date.now() });
    };
    read();
    const poll = setInterval(read, 2000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stop = true;
      clearInterval(poll);
      clearInterval(clock);
    };
  }, []);

  useEffect(() => {
    let stop = false;
    fetch("/api/mainnet")
      .then((r) => r.json())
      .then((data: MainnetJson) => {
        if (stop) return;
        if (data.error || !data.names) setMainnetFailed(true);
        else setMainnet(data);
      })
      .catch(() => !stop && setMainnetFailed(true));
    return () => {
      stop = true;
    };
  }, [attempt]);

  const retryMainnet = useCallback(() => {
    setMainnetFailed(false);
    setAttempt((a) => a + 1);
  }, []);

  return (
    <Ctx.Provider value={{ demo: demo?.data, demoAt: demo?.at ?? 0, mainnet, mainnetFailed, retryMainnet, now }}>
      {children}
    </Ctx.Provider>
  );
}

/** Seconds left on a lease right now, counting down between polls. */
export function useSecondsLeft(secondsAtRead: number): number {
  const { demoAt, now } = useLive();
  const elapsed = now > demoAt ? Math.floor((now - demoAt) / 1000) : 0;
  return Math.max(0, secondsAtRead - elapsed);
}
