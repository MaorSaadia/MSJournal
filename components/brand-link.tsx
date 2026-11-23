import Image from "next/image";
import Link from "next/link";

export function BrandLink({
  href = "/",
  label = "MSJournal home",
  className = "",
  compact = false,
  onClick,
}: {
  href?: string;
  label?: string;
  className?: string;
  compact?: boolean;
  onClick?: () => void;
}) {
  return (
    <Link href={href} aria-label={label} className={`brand-lockup ${className}`} onClick={onClick}>
      <Image src="/icon.svg" width={32} height={32} alt="" />
      {!compact && <span>MSJournal<span className="brand-lockup-dot">.</span></span>}
    </Link>
  );
}
