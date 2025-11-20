/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    // Optimize for production
    compress: true,
    poweredByHeader: false,
};

export default nextConfig;
