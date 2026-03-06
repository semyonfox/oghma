/** @type {import('next').NextConfig} */
const nextConfig = {
    // keep postgres.js out of the webpack bundle so it runs natively at runtime
    serverExternalPackages: ['postgres'],
    experimental: {
        turbopack: false,
    },
};

export default nextConfig;
