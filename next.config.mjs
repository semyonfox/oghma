/** @type {import('next').NextConfig} */
const nextConfig = {
    // Mark native modules as external so they're not bundled by Turbopack
    // Required for postgres.js, bcryptjs, and jsonwebtoken to work in standalone mode
    serverExternalPackages: ['postgres'],
};

export default nextConfig;
