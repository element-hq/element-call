import { defineConfig } from "i18next-cli";

export default defineConfig({
  locales: ["en"],
  extract: {
    input: ["src/**/*.{ts,tsx}"],
    output: "locales/{{language}}/{{namespace}}.json",
    defaultNS: "app",
    keySeparator: ".",
    nsSeparator: false,
    contextSeparator: "|",
    extractFromComments: false,
    functions: ["t", "*.t", "translatedError", "i18nKey"],
    transComponents: ["Trans"],
  },
  types: {
    input: ["locales/{{language}}/{{namespace}}.json"],
    output: "src/types/i18next.d.ts",
  },
});
