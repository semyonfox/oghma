/** @type {import('next').NextConfig} */
const nextConfig = {
    // keep postgres.js out of the webpack bundle so it runs natively at runtime
    serverExternalPackages: ['postgres'],
    // standalone output generates NFT trace files required by Amplify SSR
    output: 'standalone',
};

export default nextConfig;
