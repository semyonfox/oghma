/** @type {import('next').NextConfig} */
const nextConfig = {
    serverExternalPackages: ['postgres', 'bcryptjs', 'jsonwebtoken'],
};

export default nextConfig;
