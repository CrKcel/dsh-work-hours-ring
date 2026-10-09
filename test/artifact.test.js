/**
 * Assert the committed `client.js` is exactly what `build.mjs` produces right now.
 *
 * `package.json` carries no `prepare` script on purpose. pnpm 11 refuses to run a
 * git-hosted package's build scripts unless the *consumer* profile allowlists the
 * exact `name@git+<url>#<commit>` path, and it refuses by throwing rather than by
 * leaving a pending-build entry, so a `prepare` script would break
 * `dsh plugin --profile <profile> add github:<owner>/<repo>` outright — with no
 * "allow these scripts and retry" remedy, and one hand-written allowlist line per
 * pushed commit. The built bundle is committed instead, and this check is what keeps
 * the committed copy honest: it regenerates the artifact and compares, so a source
 * edit that was not rebuilt cannot reach a profile silently.
 *
 * The check never rewrites the tree. A stale artifact is reported and the committed
 * bytes are put back; the fix is an explicit `npm run build` plus a commit.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const artifact = join(root, "client.js");

/** The shipped bytes, read before the build overwrites them. */
const shipped = readFileSync(artifact, "utf8");

/** The build's own failure, rethrown after the tree is restored. */
let buildFailure;
try {
	execFileSync(process.execPath, ["build.mjs"], { cwd: root, stdio: "pipe" });
} catch (error) {
	buildFailure = error;
}

if (buildFailure !== undefined) {
	if (readFileSync(artifact, "utf8") !== shipped) writeFileSync(artifact, shipped);
	process.stderr.write(`FAIL build.mjs failed: ${buildFailure.message}\n`);
	process.exitCode = 1;
} else {
	const regenerated = readFileSync(artifact, "utf8");
	if (regenerated === shipped) {
		process.stdout.write("ok   committed client.js matches a fresh build\n");
	} else {
		writeFileSync(artifact, shipped);
		process.stderr.write(
			"FAIL client.js is stale: it is not what build.mjs produces from the sources at hand.\n" +
				"     Run `npm run build` and commit the regenerated client.js.\n"
		);
		process.exitCode = 1;
	}
}
