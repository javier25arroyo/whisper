/** @type {import("next").NextConfig} */
const nextConfig = {
  // Allow larger request bodies for audio uploads (20MB)
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
