import type { CSSProperties, ReactNode } from "react";

/** A glowing traffic-signal lens. The one status indicator used across every screen. */
export default function Lens({
  color,
  small,
  pulse,
  children,
}: {
  color: string;
  small?: boolean;
  pulse?: boolean;
  children?: ReactNode;
}) {
  return (
    <span className={`lens${small ? " sm" : ""}${pulse ? " pulse" : ""}`} style={{ "--c": color } as CSSProperties} aria-hidden>
      {children}
    </span>
  );
}
