// Bundles three + OrbitControls into a single classic-script (IIFE) file that
// defines globalThis.THREE. Run: npm run build:three (regenerate on upgrades).
import { build } from "esbuild";
import { writeFileSync, rmSync, statSync } from "fs";

const ENTRY = "scripts/.three-entry.mjs";
writeFileSync(
  ENTRY,
  `import * as THREE_NS from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
globalThis.THREE = { ...THREE_NS, OrbitControls };
`
);

await build({
  entryPoints: [ENTRY],
  bundle: true,
  minify: true,
  format: "iife",
  outfile: "web/src/vendor/three.iife.js",
  logLevel: "info",
});

rmSync(ENTRY);
const kb = Math.round(statSync("web/src/vendor/three.iife.js").size / 1024);
console.log(`web/src/vendor/three.iife.js written (${kb} KB)`);
