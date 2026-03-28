const vue = require("eslint-plugin-vue");
const prettier = require("eslint-config-prettier");

module.exports = [
  {
    ignores: [
      "dist/**",
      "src-capacitor/**",
      "src-cordova/**",
      ".quasar/**",
      "node_modules/**",
      "quasar.config.*.temporary.compiled*",
    ],
  },
  ...vue.configs["flat/essential"],
  {
    files: ["**/*.{js,vue}"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "module",
      globals: {
        ga: "readonly",
        cordova: "readonly",
        __statics: "readonly",
        __QUASAR_SSR__: "readonly",
        __QUASAR_SSR_SERVER__: "readonly",
        __QUASAR_SSR_CLIENT__: "readonly",
        __QUASAR_SSR_PWA__: "readonly",
        process: "readonly",
        Capacitor: "readonly",
        chrome: "readonly",
      },
    },
    rules: {
      ...prettier.rules,
      "prefer-promise-reject-errors": "off",
      "no-debugger": process.env.NODE_ENV === "production" ? "error" : "off",
    },
  },
];
