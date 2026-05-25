const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  {
    ignores: [
      "node_modules/**",
      "reports/**",
      "test-results/**",
      "tmp/**",
      "coverage/**",
      "dist/**",
      "build/**",
      "allure-results/**",
      "allure-report/**",
      "scripts/archive/**",
      "public/products.js",
      "larnitech_catalogue_04_23_web-*.svg"
    ]
  },
  js.configs.recommended,
  {
    files: ["server.js", "api/**/*.js", "db/**/*.js", "middleware/**/*.js", "routes/**/*.js", "services/**/*.js", "scripts/**/*.js", "test/**/*.js", "test-support/**/*.js", "eslint.config.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "commonjs",
      globals: {
        ...globals.node
      }
    }
  },
  {
    files: ["test/**/*.js", "scripts/capture_ui_scenarios.js", "scripts/audit_admin_ui.js"],
    languageOptions: {
      globals: {
        ...globals.browser
      }
    }
  },
  {
    files: ["public/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        ...globals.browser
      }
    }
  },
  {
    rules: {
      "no-console": "off",
      "no-control-regex": "off",
      "no-irregular-whitespace": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-constant-binary-expression": "off",
      "no-dupe-keys": "off",
      "no-useless-assignment": "off",
      "no-useless-escape": "off",
      "no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_"
      }],
      "preserve-caught-error": "off"
    }
  }
];
