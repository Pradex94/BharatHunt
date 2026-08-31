import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored AI-assistant skill packages (installed via `uipro`/`skills add`).
    // Not application source — their helper scripts use CommonJS and would
    // otherwise fail our lint rules.
    ".claude/**",
    ".agents/**",
    ".hallmark/**",
    // Self-contained Remotion project. It ships its own flat config
    // (@remotion/eslint-config-flat) and is linted by `npm run lint` inside
    // video/, not by the Next.js rules out here.
    "video/**",
  ]),
]);

export default eslintConfig;
