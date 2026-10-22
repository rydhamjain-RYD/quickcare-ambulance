import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The route planner is the home page. Keep old /driver links working.
  async redirects() {
    return [{ source: "/driver", destination: "/", permanent: false }];
  },
};

export default nextConfig;
