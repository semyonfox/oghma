// Flat config kept explicit because eslint-config-next 16.3 is not compatible
// with ESLint 10 yet.
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";

// components rely on React Compiler for memoisation, so anything that makes it
// skip a component is an error. `todo` covers syntax compiler 1.0 can't compile
// yet, such as try/finally inside a component
const reactCompilerRules = {
  ...reactHooks.configs.recommended.rules,
  "react-hooks/todo": "error",
  // a lint-only rule that does not stop compilation; the existing loading-state
  // resets in effects are left as they are
  "react-hooks/set-state-in-effect": "off",
};

export default [
  {
    ignores: [
      "node_modules/**",
      "apps/mobile/node_modules/**",
      "apps/mobile/android/**",
      "apps/mobile/dist/**",
      "apps/mobile/.expo/**",
      ".next/**",
      "out/**",
      "build/**",
      "coverage/**",
      "coverage-final.json",
      "lcov.info",
      "next-env.d.ts",
      ".archive/**",
      "public/**",
      ".worktrees/**",
      ".claude/**",
      ".unlighthouse/**",
      ".lighthouseci/**",
      "infra/**/dist/**",
    ],
  },
  {
    files: ["**/*.{js,jsx,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      "no-console": "off",
      ...reactCompilerRules,
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsparser,
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      "react-hooks": reactHooks,
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
      "no-restricted-syntax": [
        "error",
        {
          // postgres.js binds a string cast straight to jsonb as a JSON string,
          // which double-encodes JSON.stringify output
          selector: "TaggedTemplateExpression TemplateElement[value.raw=/^\\s*::jsonb/]",
          message: "Bind JSON as ${JSON.stringify(value)}::text::jsonb so it is stored as an object, not a string.",
        },
        {
          // production logs keep the message, so it must be a code constant. ids and
          // names go in metadata, where only the safe fields in logger.ts survive
          selector: "CallExpression[callee.object.name='logger'][callee.property.name=/^(error|warn|info|debug)$/][arguments.0.type!='Literal']",
          message: "Log a fixed string message and pass context as metadata, e.g. logger.error(\"import failed\", { jobId, error }).",
        },
      ],
      "no-console": "off",
      ...reactCompilerRules,
    },
  },
  {
    // the Expo app does not run React Compiler, so its try/finally is fine
    files: ["apps/mobile/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/todo": "off",
    },
  },
  {
    // App and operational TypeScript use bundler-style, extensionless local imports.
    // Canvas MCP is a separately compiled NodeNext package, where `.js` specifiers are
    // required to describe emitted ESM files.
    files: ["src/**/*.{ts,tsx}", "scripts/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
    ignores: ["src/lib/canvas-mcp/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(?:@/|\\.{1,2}/).*\\.(?:js|jsx)$",
              message: "Use an extensionless specifier for first-party TypeScript modules.",
            },
          ],
        },
      ],
    },
  },
];
