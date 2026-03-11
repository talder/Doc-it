import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

// Stub plugin so eslint-disable comments referencing @next/next/* don't error
const nextStub = {
  rules: {
    "no-img-element": { meta: { type: "suggestion" }, create: () => ({}) },
  },
};

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [".next/", "node_modules/", "empty-module.js"],
  },
  {
    plugins: {
      "react-hooks": reactHooks,
      "@next/next": nextStub,
    },
    rules: {
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/rules-of-hooks": "error",
      "@next/next/no-img-element": "off",
    },
  },
  {
    rules: {
      // Allow unused vars prefixed with _ (common pattern)
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
      "@typescript-eslint/no-explicit-any": "warn",
      // require() is used in a few places (e.g. crypto randomBytes)
      "@typescript-eslint/no-require-imports": "off",
      // Empty catch blocks are intentional (error suppression pattern)
      "no-empty": ["warn", { allowEmptyCatch: true }],
      // Comma expressions and void expressions used in JSX event handlers
      "no-unused-expressions": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      // Assignment checks — too noisy for reactive state patterns
      "no-useless-assignment": "off",
      // Escape chars in regex character classes (e.g. \-) are harmless
      "no-useless-escape": "warn",
      // Allow @ts-ignore comments (existing codebase uses them)
      "@typescript-eslint/ban-ts-comment": "off",
      // Irregular whitespace in template strings / UI text is intentional
      "no-irregular-whitespace": "off",
      // Downgrade to warn — existing code has a few of these
      "no-constant-binary-expression": "warn",
      "prefer-const": "warn",
    },
  },
  {
    // Disable reporting errors for eslint-disable comments referencing
    // plugins that are not loaded (react-hooks, @next/next).
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
  },
);
