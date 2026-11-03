import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Next.js dev mode only serves its scripts to localhost by default. Without this, opening the
  // dev server as 127.0.0.1 or from a phone on the same Wi-Fi loads the page but no JavaScript,
  // so every button silently does nothing. (Production builds are not affected.)
  allowedDevOrigins: ["127.0.0.1", "192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
  // firebase-admin and web-push only run in API routes (Node.js runtime).
  serverExternalPackages: ["firebase-admin", "web-push"],
  experimental: {
    // Lets `next dev` offer agent-assisted upgrades for security releases only.
    agentUpgrade: "security",
  },
  async headers() {
    return [
      {
        // The service worker must never be served stale, or users get stuck on old code.
        source: "/service-worker.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Camera is needed by the Scan page on our own origin only.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
