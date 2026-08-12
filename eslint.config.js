import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // `docs/` is TypeDoc's generated HTML/JS bundle and `website/build` is
  // Docusaurus output — both are gitignored build artifacts, and linting them
  // produces hundreds of meaningless errors for anyone who has run the docs
  // scripts locally.
  { ignores: ["dist/", "docs/", "website/", "node_modules/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
