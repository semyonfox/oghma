/** @type {import('next').NextConfig} */
const nextConfig = {
    // keep native/credential-dependent packages out of the Turbopack bundle
    // AWS SDK must not be bundled — Turbopack tree-shakes credential providers
    serverExternalPackages: ['postgres', 'winston-cloudwatch', 'aws-xray-sdk-core',
        '@aws-sdk/client-secrets-manager', '@aws-sdk/credential-provider-node'],
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