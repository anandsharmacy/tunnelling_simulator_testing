import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        module: "readonly",
        require: "readonly",
        process: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
      },
    },
  },
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        requestAnimationFrame: "readonly",
        fetch: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        ResizeObserver: "readonly",
        Float64Array: "readonly",
        Math: "readonly",
        parseInt: "readonly",
        parseFloat: "readonly",
      },
    },
    rules: {
      "no-var": "error",
      "prefer-const": "warn",
    },
  },
];
