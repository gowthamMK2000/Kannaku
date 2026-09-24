export function inr(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

export function initials(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

const AVATAR_PALETTE = [
  { bg: "#F3E4D3", fg: "#8A4B14" },
  { bg: "#E1E8F0", fg: "#2F4A6B" },
  { bg: "#EFE2EE", fg: "#6B3566" },
  { bg: "#E4EDE2", fg: "#2F5A3A" },
  { bg: "#F4EBC9", fg: "#6B5310" },
  { bg: "#E0EAEA", fg: "#2A5C5C" },
  { bg: "#F0E0E4", fg: "#7A2F42" },
];

/** Deterministic avatar colors so a member's color stays stable across renders. */
export function avatarColors(userId: string, isAdmin: boolean): { bg: string; fg: string } {
  if (isAdmin) return { bg: "#1B1A17", fg: "#F6F3EC" };
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

export const CATEGORY_META: Record<string, { label: string; bg: string; fg: string }> = {
  food: { label: "Food", bg: "#F3E4D3", fg: "#8A4B14" },
  stay: { label: "Stay", bg: "#E1E8F0", fg: "#2F4A6B" },
  travel: { label: "Travel", bg: "#E4EDE2", fg: "#2F5A3A" },
  fun: { label: "Fun", bg: "#EFE2EE", fg: "#6B3566" },
};

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

export function formatRelative(iso: string | null): string {
  if (!iso) return "Never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return mins + "m ago";
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
