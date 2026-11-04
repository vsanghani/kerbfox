import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "dist-server/**",
      ".vercel/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "src/api/schema.d.ts",
      "contracts/openapi.json",
      "playwright/.cache/**",
      "tests/visual/__screenshots__/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  {
    files: ["server/**/*.mjs", "api/**/*.js", "tools/**/*.mjs"],
    languageOptions: {
      globals: {
        URL: "readonly",
        URLSearchParams: "readonly",
        process: "readonly",
        console: "readonly",
        fetch: "readonly",
        Request: "readonly",
        Response: "readonly",
        Headers: "readonly",
        AbortSignal: "readonly",
        TextEncoder: "readonly",
      },
    },
  },
  prettier,
);
