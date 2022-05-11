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
        // We break this rule in a few places: dial it back to a warning
        // (and run with max warnings) to tolerate the existing code
        "react-hooks/exhaustive-deps": ["warn"],
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
