import "server-only";
import { isAIEnabled } from "@/lib/ai/config";
import { isAnyAIConfigured } from "@/lib/ai/providers";
import type { ScoringAvailability } from "./availability";
import { isCodeRunnerConfigured } from "./code-checks";

export function isRolePilotEnabled(roleId: string) {
  return (process.env.IMPRINT_PILOT_ROLES ?? "").split(",").some((role) => role.trim() === roleId);
}

export function isRoleScoringEnabled(roleId: string) {
  return getScoringAvailability(roleId) === "enabled";
}

export function getScoringAvailability(roleId: string): ScoringAvailability {
  if (!isAIEnabled() || !isRolePilotEnabled(roleId)) return "disabled";
  if (roleId === "software-developer" && !isCodeRunnerConfigured()) return "unavailable";
  return isAnyAIConfigured() ? "enabled" : "unavailable";
}

export function reviewerAllowed(id: string) {
  return (process.env.IMPRINT_REVIEWER_IDS ?? "").split(",").some((value) => value.trim() === id);
}
