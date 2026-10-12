import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // The app is a static export with `images.unoptimized`, so next/image adds
      // nothing over a plain <img> here.
      "@next/next/no-img-element": "off",
    },
  },
  {
    // Type-aware rules for app code: forbid `any`, explicit or leaked in through
    // JSON.parse / res.json() and friends.
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-call": "error",
    },
  },
  {
    // Plain CommonJS Node scripts (asset pipelines, jest config).
    files: ["scripts/**/*.js", "jest.config.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local screenshot / driver output.
    "visual-*/**",
    "scripts/drivers/out/**",
  ]),
]);

export default eslintConfig;
