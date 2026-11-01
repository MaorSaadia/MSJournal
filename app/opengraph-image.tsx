import { ImageResponse } from "next/og";
export const alt = "MSJournal — Your trades. Your habits. A clearer picture.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", background: "#0c1014", color: "#edf5f2", display: "flex", flexDirection: "column", padding: "64px 72px", backgroundImage: "radial-gradient(ellipse at 90% 0%, #173b32 0%, transparent 65%)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <svg width="60" height="60" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#047857"/><path d="M13 43V24h6v3c3-5 10-4 12 0 4-5 12-4 12 4v12h-6V32c0-4-6-4-6 0v11h-6V32c0-4-6-4-6 0v11Zm35-20h6v23c0 7-4 10-10 10v-6c3 0 4-1 4-4Z" fill="#fff"/><circle cx="51" cy="16" r="4" fill="#a7f3d0"/></svg>
        <div style={{ fontSize: 37, fontWeight: 700, letterSpacing: -1 }}>MSJournal</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 62, fontSize: 70, fontWeight: 700, letterSpacing: -3, lineHeight: 1.15 }}><span>Your trades. Your habits.</span><span style={{ color: "#55e8ad" }}>A clearer picture.</span></div>
      <div style={{ display: "flex", marginTop: 36, fontSize: 23, color: "#b0bfc8" }}>Futures trading journal & analytics</div>
      <div style={{ display: "flex", marginTop: "auto", height: 5, borderRadius: 4, background: "linear-gradient(90deg, #34d399, #34d399 45%, #a78bfa 100%)" }} />
    </div>, size,
  );
}
