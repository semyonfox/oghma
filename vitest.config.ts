import { defineConfig, type Plugin } from 'vitest/config';
import { transformAsync } from '@babel/core';
import reactCompiler from 'babel-plugin-react-compiler';
import path from 'path';

const srcDir = path.resolve(import.meta.dirname, './src');
const appDir = path.join(srcDir, 'app');

// production builds run React Compiler (next.config.mjs), and components no
// longer memoise by hand, so tests compile app code the same way
function reactCompilerPlugin(): Plugin {
    return {
        name: 'react-compiler',
        enforce: 'pre',
        async transform(code, id) {
            const file = id.split('?')[0];
            if (!file.startsWith(srcDir) || file.includes('/__tests__/') || !/\.[jt]sx?$/.test(file)) return null;
            // route modules are server components unless marked, and tests call
            // those directly as async functions rather than rendering them
            if (file.startsWith(appDir) && !/^\s*["']use client["']/.test(code)) return null;
            const result = await transformAsync(code, {
                filename: file,
                babelrc: false,
                configFile: false,
                sourceMaps: true,
                // babel 8 honours jsx in .ts files, where it misreads generic arrows like <T>() =>
                parserOpts: { plugins: file.endsWith('.ts') ? ['typescript'] : ['typescript', 'jsx'] },
                plugins: [reactCompiler],
            });
            if (!result?.code) return null;
            // babel 8 types its map arrays as readonly, rollup's object form wants
            // mutable ones, so hand it over in the string form it also accepts
            return { code: result.code, map: result.map ? JSON.stringify(result.map) : null };
        },
    };
}

export default defineConfig({
    plugins: [reactCompilerPlugin()],
    test: {
        environment: 'node',
        globals: true,
        setupFiles: ['./src/__tests__/setup.ts'],
        include: ['src/__tests__/**/*.test.{js,jsx,ts,tsx}'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            include: ['src/**/*.{ts,tsx,js,jsx}'],
            exclude: ['src/__tests__/**', 'src/**/*.d.ts'],
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(import.meta.dirname, './src'),
        },
    },
});
