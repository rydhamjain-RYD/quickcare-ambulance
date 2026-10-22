import Link from "next/link";

/** Small "back to the route planner" link at the top of the officer and hospital screens. */
export default function BackLink({ href = "/", label = "Route planner" }: { href?: string; label?: string }) {
  return (
    <Link href={href} className="back" aria-label={`Back to ${label}`}>
      ← {label}
    </Link>
  );
}
