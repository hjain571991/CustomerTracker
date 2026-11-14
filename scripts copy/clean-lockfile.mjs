/**
 * Rewrites internal registry-proxy URLs in package-lock.json back to the public
 * registry.
 *
 * Databricks blocks public registries and resolves through an internal proxy
 * (go/npm-registry-access). npm records whichever registry it used in every
 * `resolved` URL, so a lockfile produced here would (a) leak an internal
 * hostname if the repo is public and (b) fail on CI runners that cannot reach
 * the proxy. The integrity hashes are unaffected — same tarballs, same digests
 * — so swapping the host back is safe and keeps the lockfile portable.
 *
 * Runs automatically after every install. A no-op on machines that already use
 * the public registry.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const lockfile = resolve(dirname(fileURLToPath(import.meta.url)), "..", "package-lock.json");
if (!existsSync(lockfile)) process.exit(0);

const PUBLIC = "https://registry.npmjs.org/";
const PROXIES = [
  /https:\/\/npm-proxy\.cloud\.databricks\.com\//g,
  /https:\/\/npm-proxy\.dev\.databricks\.com\//g,
];

const before = readFileSync(lockfile, "utf8");
let after = before;
let replaced = 0;
for (const pattern of PROXIES) {
  after = after.replace(pattern, () => {
    replaced++;
    return PUBLIC;
  });
}

if (replaced) {
  writeFileSync(lockfile, after);
  console.log(`clean-lockfile: rewrote ${replaced} internal proxy URL(s) to the public registry`);
}
