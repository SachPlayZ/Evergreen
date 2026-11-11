import type { WillowState } from "@/app/components/Willow";

export interface LeaseJson {
  name: string;
  owner: string;
  status: WillowState;
  secondsLeft: number;
}
export interface StewardJson {
  stewardId: string;
  patron: string;
  principalYocto: string;
  tipsYocto: string;
  tipCount: number;
  stakedYocto: string;
  rewardsYocto: string;
  rentYocto: string;
  phase: string | Record<string, unknown>;
  renewals: { atNs: string; newExpiresNs: string; rentYocto: string }[];
}
export interface NameJson {
  lease: LeaseJson;
  steward?: StewardJson;
  warnings: { code: string; message: string }[];
}
export interface DemoJson {
  configured: boolean;
  label?: string;
  termSecs?: number;
  names?: NameJson[];
}
export interface MainnetJson {
  registryId: string;
  namespaces: number;
  nameCount: number;
  nearUsd: number;
  names: { name: string; owner: string; status: string; secondsLeft: number; expiresAtMs: number }[];
  error?: string;
}

export const near = (yocto: string, digits = 2) => (Number(BigInt(yocto) / 10n ** 18n) / 1e6).toFixed(digits);

export function timeLeft(seconds: number): string {
  if (seconds <= 0) return "expired";
  if (seconds < 120) return `${seconds}s`;
  if (seconds < 7200) return `${Math.round(seconds / 60)} min`;
  if (seconds < 172800) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86400)} days`;
}

const PHASE: Record<string, string> = {
  Idle: "Resting. Its Stake is earning.",
  Unstaking: "Pulling the next Rent out of its rewards.",
  Withdrawing: "Moving the Rent onto the Name.",
  Renewing: "Paying its own Rent.",
  Evacuated: "Stake pulled to safety. Needs a Lifeline.",
};
export function phaseText(phase: StewardJson["phase"]): string {
  const key = typeof phase === "string" ? phase : Object.keys(phase)[0];
  return PHASE[key] ?? key;
}

export const STATUS: Record<string, string> = {
  active: "Active",
  grace: "In Grace",
  reclaimable: "Reclaimable",
  suspended: "Suspended",
  not_rented: "Not rented",
};

export const shortDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
