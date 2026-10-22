"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// The app is a route planner. Officers and hospitals have their own logins, kept small and out of the way.
const LINKS = [
  { href: "/officer", label: "Officer login" },
  { href: "/hospital", label: "Hospital login" },
];

export default function NavBar() {
  const path = usePathname();
  return (
    <header className="topbar">
      <div className="topbar-in">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <rect x="9" y="3" width="6" height="18" rx="1.5" fill="#dc2626" />
              <rect x="3" y="9" width="18" height="6" rx="1.5" fill="#dc2626" />
            </svg>
          </span>
          QuickCare
        </Link>
        <nav className="nav" aria-label="Other logins">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={path.startsWith(l.href) ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
