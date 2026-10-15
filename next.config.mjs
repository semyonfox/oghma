import { withSentryConfig } from "@sentry/nextjs/config";

/** @type {import('next').NextConfig} */
const nextConfig = {
    // Allow local browser automation/dev previews to hydrate on loopback or LAN.
    allowedDevOrigins: ['127.0.0.1', '10.0.0.5', ...(process.env.NEXT_DEV_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean)],
    // keep native/credential-dependent packages out of the Turbopack bundle
    // Provider SDK credential loaders must stay external for Node/Docker builds.
    serverExternalPackages: ['postgres', '@aws-sdk/credential-provider-node'],
    // next dev would otherwise append its own block to AGENTS.md on every start
    agentRules: false,
    // standalone output keeps Docker/Node deployments small and portable
    output: 'standalone',

    // next 16 defaults to the tsc-cli type checker, which needs typescript/bin/tsc;
    // our `typescript` alias (@typescript/typescript6) only ships bin/tsc6,
    // so keep the in-process TypeScript API path
    experimental: {
        useTypeScriptCli: false,
    },

    images: {
        formats: ['image/avif', 'image/webp'],
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'images.unsplash.com',
            },
        ],
    },

    async headers() {
        return [
            {
                source: '/downloads/oghmanotes-alpha.apk',
                headers: [
                    { key: 'Content-Type', value: 'application/vnd.android.package-archive' },
                    { key: 'Content-Disposition', value: 'attachment; filename="oghmanotes-alpha.apk"' },
                    { key: 'Cache-Control', value: 'no-cache' },
                    { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
                ],
            },
            {
                source: '/(.*)',
                headers: [
                    { key: 'X-Frame-Options', value: 'DENY' },
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
                    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
                    { key: 'X-XSS-Protection', value: '1; mode=block' },
                    { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https: wss: blob: http://oghma-rustfs:9000; frame-ancestors 'none'" },
                ],
            },
        ];
    },
};

export default withSentryConfig(nextConfig, {
    org: 'semyon-g7',
    project: 'oghma',
    authToken: process.env.SENTRY_AUTH_TOKEN,
    silent: !process.env.CI,
    sourcemaps: {
        disable: !process.env.SENTRY_AUTH_TOKEN,
        deleteSourcemapsAfterUpload: true,
    },
    release: { name: process.env.SENTRY_RELEASE },
});
