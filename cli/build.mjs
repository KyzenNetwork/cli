// Builds the Kyzen Network CLI (SPEC 3.8, Step 10): one CommonJS file with viem and the data layer
// bundled in, no dependencies, then the npm tarball the site serves at /dl/kyzen-<version>.tgz.
// Run from the repo root: node cli/build.mjs
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { rolldown } from "rolldown";

const root = process.cwd();
const cli = path.join(root, "cli");
const pkgDir = path.join(cli, "pkg");
const { name, version } = JSON.parse(await readFile(path.join(cli, "package.json"), "utf8"));

await rm(pkgDir, { recursive: true, force: true });
await mkdir(pkgDir, { recursive: true });

const bundle = await rolldown({
  input: path.join(cli, "src", "bin.ts"),
  platform: "node",
  tsconfig: path.join(cli, "tsconfig.json"),
  // The data layer's network module reads this at build time; "mainnet" drops the local anvil branch.
  transform: { define: { "process.env.NEXT_PUBLIC_KYZEN_NETWORK": JSON.stringify("mainnet") } },
});
await bundle.write({ file: path.join(pkgDir, "kyzen.js"), format: "cjs", banner: "#!/usr/bin/env node", codeSplitting: false });
await bundle.close();

for (const f of ["package.json", "README.md", "LICENSE"]) await copyFile(path.join(cli, f), path.join(pkgDir, f));

const dl = path.join(root, "public", "dl");
await mkdir(dl, { recursive: true });
execFileSync("npm", ["pack", "--pack-destination", dl], { cwd: pkgDir, stdio: ["ignore", "ignore", "inherit"] });
// npm names the file after the package (kyzen-cli); the site serves it as kyzen-<version>.tgz.
const tgz = path.join(dl, `kyzen-${version}.tgz`);
if (name !== "kyzen") await rename(path.join(dl, `${name}-${version}.tgz`), tgz);
console.log(`built ${path.relative(root, tgz)} (${((await stat(tgz)).size / 1024).toFixed(0)} KB), bundle ${((await stat(path.join(pkgDir, "kyzen.js"))).size / 1024).toFixed(0)} KB`);
