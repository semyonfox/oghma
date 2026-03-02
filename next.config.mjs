/** @type {import('next').NextConfig} */
const nextConfig = {
    webpack(config) {
        // @react-aria/utils ships a malformed exports field (missing "." key)
        // that both Turbopack and webpack fail to resolve from ESM .mjs files.
        // Alias it directly to its CJS main so resolution always works.
        config.resolve.alias['@react-aria/utils'] = new URL(
            './node_modules/@react-aria/utils/dist/main.js',
            import.meta.url
        ).pathname;
        return config;
    },
};

export default nextConfig;
