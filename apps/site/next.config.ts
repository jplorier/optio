import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  output: "export",
  basePath: isProd ? "/optio" : "",
  assetPrefix: isProd ? "/optio/" : "",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
