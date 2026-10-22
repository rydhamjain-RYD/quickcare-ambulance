import Link from "next/link";

/** Back arrow shown at the top of each screen. Goes to the home page that lists all four screens. */
export default function BackLink({ href = "/", label = "Home" }: { href?: string; label?: string }) {
  return (
    <Link href={href} className="back" aria-label={`Back to ${label}`}>
      <span aria-hidden>←</span> {label}
    </Link>
  );
}
