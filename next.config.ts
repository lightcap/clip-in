import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable React strict mode for better development experience
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.onepeloton.com",
      },
      {
        protocol: "https",
        hostname: "**.peloton.com",
      },
      {
        protocol: "https",
        hostname: "s3.amazonaws.com",
        pathname: "/peloton-ride-images/**",
      },
    ],
  },
};

export default nextConfig;
