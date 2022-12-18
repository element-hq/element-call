export default {
  keySeparator: false,
  namespaceSeparator: false,
  contextSeparator: "|",
  pluralSeparator: "|",
  createOldCatalogs: false,
  defaultNamespace: "app",
  lexers: {
    ts: [
      {
        lexer: "JavascriptLexer",
        functions: ["t", "translatedError"],
        functionsNamespace: ["useTranslation", "withTranslation"],
      },
    ],
  },
  locales: ["en-GB"],
  output: "public/locales/$LOCALE/$NAMESPACE.json",
  input: ["src/**/*.{ts,tsx}"],
  sort: true,
  useKeysAsDefaultValue: true,
};
