import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // server.js and lib/server/*.js are plain CommonJS, required directly by
    // Node (not bundled by Next), so the TS/React rules built for app code
    // don't apply: require() is the point, and useSupabaseAuthState is a
    // plain async factory function that happens to start with "use", not a
    // React hook.
    files: ["server.js", "lib/server/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "react-hooks/rules-of-hooks": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
