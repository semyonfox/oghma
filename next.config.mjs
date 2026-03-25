/** @type {import('next').NextConfig} */
const nextConfig = {
    // keep postgres.js out of the webpack bundle so it runs natively at runtime
    serverExternalPackages: ['postgres', 'winston-cloudwatch'],
    // standalone output generates NFT trace files required by Amplify SSR
    output: 'standalone',
    async headers() {
        return [
            {
                source: '/(.*)',
                headers: [
                    { key: 'X-Frame-Options', value: 'DENY' },
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
                ],
            },
        ];
    },
};

export default nextConfig;
