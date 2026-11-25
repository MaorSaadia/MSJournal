import Image from "next/image";
import Link from "next/link";
import { PublicPageLink } from "@/components/public-page-link";

export function BrandLink({
  href = "/",
  label = "MSJournal home",
  className = "",
  compact = false,
  documentNavigation = false,
  onClick,
}: {
  href?: string;
  label?: string;
  className?: string;
  compact?: boolean;
  documentNavigation?: boolean;
  onClick?: () => void;
}) {
  const BrandAnchor = documentNavigation ? PublicPageLink : Link;
  return (
    <BrandAnchor href={href} aria-label={label} className={`brand-lockup ${className}`} onClick={onClick}>
      <Image src="/icon.svg" width={32} height={32} alt="" />
      {!compact && <span>MSJournal<span className="brand-lockup-dot">.</span></span>}
    </BrandAnchor>
  );
}
