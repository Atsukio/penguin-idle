// ESLint, used only as a safety net (npm run lint): it fails when a script uses a name that
// doesn't exist, such as a variable left behind when code moves between files.
// It isn't a style checker; the game still runs straight from these files with no build step.
const globals = require("globals");

module.exports = [
  { ignores: ["node_modules/", "playwright-report/", "test-results/"] },
  {
    // Game scripts: plain <script> tags in the browser. data.js and the engine also load in Node (tools/).
    files: ["src/**/*.js"],
    languageOptions: { ecmaVersion: 2023, sourceType: "script", globals: { ...globals.browser, module: "readonly", Buffer: "readonly" } },
    rules: { "no-undef": "error" },
  },
  {
    files: ["sw.js"],
    languageOptions: { ecmaVersion: 2023, sourceType: "script", globals: globals.serviceworker },
    rules: { "no-undef": "error" },
  },
  {
    files: ["tools/**/*.js", "tests/**/*.js", "*.config.js"],
    languageOptions: { ecmaVersion: 2023, sourceType: "commonjs", globals: { ...globals.node } },
    rules: { "no-undef": "error" },
  },
  {
    // Playwright runs these callbacks inside the page, so browser globals and the game's PI are fine there too
    files: ["tests/**/*.js"],
    languageOptions: { globals: { ...globals.browser, PI: "readonly" } },
  },
];
