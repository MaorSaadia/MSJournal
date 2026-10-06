import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Recovery/verification links contain credentials in URLs; never log requests.
  logging: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
};

export default nextConfig;
