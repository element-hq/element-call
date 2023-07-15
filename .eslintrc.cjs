module.exports = {
  plugins: ["matrix-org"],
  extends: [
    "prettier",
    "plugin:matrix-org/react",
    "plugin:matrix-org/a11y",
    "plugin:matrix-org/typescript",
  ],
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: "module",
    project: ["./tsconfig.json"],
  },
  env: {
    browser: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  rules: {
    "jsx-a11y/media-has-caption": ["off"],
  },
  overrides: [
    {
      files: ["src/**/*.{ts,tsx}"],
      extends: [
        "plugin:matrix-org/typescript",
        "plugin:matrix-org/react",
        "prettier",
      ],
      rules: {
        // We're aiming to convert this code to strict mode
        "@typescript-eslint/no-non-null-assertion": "off",
      },
    },
  ],
  settings: {
    react: {
      version: "detect",
    },
  },
};
