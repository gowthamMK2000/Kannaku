import type { SVGProps } from "react";
import type { Category } from "@/types";

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps) {
  return { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, ...props };
}

export function FoodIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7 3v18M4 3v5a3 3 0 0 0 6 0V3M17 21V3c-2 1.2-3.2 3.6-3.2 6.5V14H17" />
    </svg>
  );
}

export function StayIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 19V6M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-7v6" />
      <circle cx="7" cy="11.5" r="1.8" />
    </svg>
  );
}

export function TravelIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 17h14v-4l-2-5H7l-2 5z" />
      <path d="M5 13h14" />
      <circle cx="8" cy="17.5" r="1.5" />
      <circle cx="16" cy="17.5" r="1.5" />
    </svg>
  );
}

export function FunIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 8V6h18v2a2 2 0 0 0 0 4 2 2 0 0 0 0 4v2H3v-2a2 2 0 0 0 0-4 2 2 0 0 0 0-4z" />
      <path d="M14 6v12" strokeDasharray="2 2.5" />
    </svg>
  );
}

export function CategoryIcon({ category, ...props }: { category: Category } & IconProps) {
  if (category === "food") return <FoodIcon {...props} />;
  if (category === "stay") return <StayIcon {...props} />;
  if (category === "travel") return <TravelIcon {...props} />;
  return <FunIcon {...props} />;
}

export function HomeNavIcon(props: IconProps) {
  return (
    <svg {...base({ width: 22, height: 22, strokeWidth: 1.9, ...props })}>
      <path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" />
    </svg>
  );
}

export function ExpensesNavIcon(props: IconProps) {
  return (
    <svg {...base({ width: 22, height: 22, strokeWidth: 1.9, ...props })}>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  );
}

export function OwesNavIcon(props: IconProps) {
  return (
    <svg {...base({ width: 22, height: 22, strokeWidth: 1.9, ...props })}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" />
    </svg>
  );
}

export function BadCopNavIcon(props: IconProps) {
  return (
    <svg {...base({ width: 22, height: 22, strokeWidth: 1.9, ...props })}>
      <path d="M4 10v4a1 1 0 0 0 1 1h3l5 4V5L8 9H5a1 1 0 0 0-1 1z" />
      <path d="M17 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base({ strokeWidth: 2.4, ...props })}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base({ strokeWidth: 2.2, ...props })}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" />
    </svg>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16.5v.01" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...base({ strokeWidth: 2.6, ...props })}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function MoreIcon(props: IconProps) {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </svg>
  );
}

export function BankerIcon(props: IconProps) {
  return (
    <svg {...base({ width: 13, height: 13, strokeWidth: 2.2, ...props })}>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l9-9M17 6l3 3M15 8l2 2" />
    </svg>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <svg {...base({ width: 22, height: 22, strokeWidth: 2, ...props })}>
      <path d="M3 11l16-7-5 17-3-7z" />
      <path d="M11 14l8-10" />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...base({ strokeWidth: 2, ...props })}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </svg>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <svg {...base({ strokeWidth: 2, ...props })}>
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

export function GearIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 7.04 4.3l.06.06A1.65 1.65 0 0 0 8.92 4.7 1.65 1.65 0 0 0 10 3.18V3a2 2 0 0 1 4 0v.09c0 .68.39 1.29 1 1.51a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.32 9c.22.61.83 1 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden>
      <rect width="28" height="28" rx="8" fill="#1F6F54" />
      <path d="M10 8v12M10 14.5l7-6.5M12.5 12.5l5 7.5" stroke="#F6F3EC" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
