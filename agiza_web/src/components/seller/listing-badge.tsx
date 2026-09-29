import type { ListingState } from "@/lib/api/types";

import { Badge, type Tone } from "../ui/badge";

export const LISTING: Record<ListingState, { label: string; tone: Tone }> = {
  published: { label: "Live", tone: "success" },
  pending_review: { label: "Waiting for AGIZA review", tone: "warning" },
  draft: { label: "Draft", tone: "neutral" },
  rejected: { label: "Changes needed", tone: "danger" },
  inactive: { label: "Hidden", tone: "neutral" },
  disabled: { label: "Disabled by AGIZA", tone: "danger" },
};

export function ListingBadge({ state }: { state: ListingState }) {
  const s = LISTING[state];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
