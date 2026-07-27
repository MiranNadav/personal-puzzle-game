import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Architecture invariant: src/core/** is pure TypeScript with zero deps.
    // No react/three/next/DOM. Enforced as a build error, the only boundary
    // that survives.
    files: ["src/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "react", message: "core/ must stay framework-free." },
            { name: "react-dom", message: "core/ must stay framework-free." },
            { name: "three", message: "core/ must stay framework-free." },
            { name: "next", message: "core/ must stay framework-free." },
          ],
          patterns: [
            {
              group: ["react", "react-*", "three", "three/*", "next", "next/*", "@react-three/*"],
              message: "core/ must stay framework-free (no react/three/next).",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
