export default {
  keySeparator: ".",
  namespaceSeparator: false,
  contextSeparator: "|",
  pluralSeparator: "_",
  createOldCatalogs: false,
  defaultNamespace: "app",
  lexers: {
    ts: [
      {
        lexer: "JavascriptLexer",
        functions: ["t", "translatedError"],
        namespaceFunctions: ["useTranslation", "withTranslation"],
      },
    ],
    tsx: [
      {
        lexer: "JsxLexer",
        functions: ["t", "translatedError"],
        namespaceFunctions: ["useTranslation", "withTranslation"],
      },
    ],
  },
  locales: ["en-GB"],
  output: "public/locales/$LOCALE/$NAMESPACE.json",
  input: ["src/**/*.{ts,tsx}"],
  sort: true,
};
