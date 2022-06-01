module.exports = {
    plugins: [
        "matrix-org",
    ],
    extends: [
        "plugin:matrix-org/react",
        "plugin:matrix-org/a11y",
        "prettier",
    ],
    env: {
        browser: true,
        node: true,
    },
    parserOptions: {
        "ecmaVersion": "latest",
        "sourceType": "module",
    },
    rules: {
        "jsx-a11y/media-has-caption": ["off"],
    },
    overrides: [
        {
            files: [
                "src/**/*.{ts,tsx}",
            ],
            extends: [
                "plugin:matrix-org/typescript",
                "plugin:matrix-org/react",
                "prettier",
            ],
        },
    ],
    settings: {
        react: {
            version: "detect",
        },
    },
};
