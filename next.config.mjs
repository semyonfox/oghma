/** @type {import('next').NextConfig} */
const nextConfig = {
    // Use webpack bundler instead of Turbopack for better postgres.js compatibility
    experimental: {
        turbopack: false,
    },
};

export default nextConfig;
