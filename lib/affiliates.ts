export const affiliateCommissionRate = 20;
export const affiliateReferralCookie = "msj_whop_referral";

export function affiliateCode(value: string | null | undefined) {
  return value && /^[a-zA-Z0-9_.-]{1,80}$/.test(value) ? value : undefined;
}

export function affiliateJoinUrl(value = process.env.WHOP_AFFILIATE_JOIN_URL) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const path = decodeURIComponent(url.pathname).toLowerCase();
    if (
      url.protocol !== "https:" || !["whop.com", "www.whop.com"].includes(url.hostname) ||
      url.port || url.username || url.password || path === "/" ||
      /(?:^|\/)(?:checkout|dashboard)(?:\/|$)/.test(path) ||
      url.searchParams.has("a") || url.searchParams.has("affiliate_code")
    ) return null;
    return url.href;
  } catch {
    return null;
  }
}
