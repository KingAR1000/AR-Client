// Run on the owner's computer. Private signing material never belongs in git/chat.
import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const repo = "KingAR1000/AR-Client";
function command(program, args, options = {}) {
  const result = spawnSync(program, args, {
    shell: false,
    encoding: "utf8",
    ...options,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `${program} ${args.slice(0, 2).join(" ")} failed. Check the command's permissions and prerequisites.`,
    );
  return result.stdout?.trim() ?? "";
}
function hiddenPassword() {
  return new Promise((resolvePassword, reject) => {
    process.stdout.write(
      "Updater key password (hidden; enter the same password used during generation): ",
    );
    process.stdin.setRawMode(true);
    process.stdin.setEncoding("utf8");
    process.stdin.resume();
    let value = "";
    const finish = () => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
    };
    function onData(chunk) {
      for (const char of chunk) {
        if (char === "\u0003") {
          finish();
          reject(new Error("Cancelled."));
          return;
        }
        if (char === "\r" || char === "\n") {
          finish();
          resolvePassword(value);
          return;
        }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else if (char >= " " && char !== "\u001b") value += char;
      }
    }
    process.stdin.on("data", onData);
  });
}
async function main() {
  if (!process.stdin.isTTY || process.env.CI)
    throw new Error(
      "Run interactively on your own computer, not in CI or a chat execution environment.",
    );
  if (!existsSync("src-tauri/tauri.conf.json"))
    throw new Error("Run from the AR Client repository root.");
  command("gh", ["auth", "status"]);
  const admin = command("gh", [
    "api",
    `repos/${repo}`,
    "--jq",
    ".permissions.admin",
  ]);
  if (admin !== "true")
    throw new Error(
      "Sign in to GitHub CLI with an account that administers AR-Client: gh auth login",
    );
  const require = createRequire(import.meta.url);
  const cli = require.resolve("@tauri-apps/cli/tauri.js");
  const directory = join(homedir(), ".ar-client-release");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const keyPath = join(directory, "updater.key");
  const existingSecrets = spawnSync(
    "gh",
    ["secret", "list", "--repo", repo, "--env", "release", "--json", "name"],
    { encoding: "utf8" },
  );
  if (existingSecrets.status === 0) {
    const names = JSON.parse(existingSecrets.stdout).map(
      (secret) => secret.name,
    );
    if (!existsSync(keyPath) && names.includes("TAURI_SIGNING_PRIVATE_KEY")) {
      throw new Error(
        "A release signing key already exists in GitHub. Restore its private backup on this computer before continuing; this helper will not replace its identity.",
      );
    }
  } else if (!existingSecrets.stderr?.includes("404")) {
    throw new Error(
      "Cannot inspect release-secret names. Check GitHub CLI permissions before generating a key.",
    );
  }
  if (!existsSync(keyPath)) {
    console.log(
      "Create an encrypted updater key. Choose a nonempty password and keep a private backup.",
    );
    command(
      process.execPath,
      [cli, "signer", "generate", "--write-keys", keyPath],
      { stdio: "inherit" },
    );
  }
  if (!existsSync(`${keyPath}.pub`))
    throw new Error(
      `Public key missing beside ${keyPath}. Do not overwrite an existing signing key.`,
    );
  const password = await hiddenPassword();
  if (!password)
    throw new Error(
      "An empty password is not accepted by this setup helper. Existing key files were preserved.",
    );
  const probe = mkdtempSync(join(tmpdir(), "ar-client-signing-"));
  try {
    const file = join(probe, "probe.txt");
    writeFileSync(file, "AR Client updater key validation");
    command(
      process.execPath,
      [
        cli,
        "signer",
        "sign",
        "--private-key-path",
        keyPath,
        "--app-version",
        "0.1.0",
        file,
      ],
      {
        env: { ...process.env, TAURI_SIGNING_PRIVATE_KEY_PASSWORD: password },
        stdio: ["ignore", "ignore", "pipe"],
      },
    );
  } finally {
    rmSync(probe, { recursive: true, force: true });
  }
  // Preserve any existing environment protection rules. Create only if absent.
  const environment = spawnSync(
    "gh",
    ["api", `repos/${repo}/environments/release`],
    { encoding: "utf8" },
  );
  if (environment.status !== 0) {
    if (!environment.stderr?.includes("404"))
      throw new Error(
        "Cannot inspect the release environment; no settings were changed.",
      );
    command(
      "gh",
      [
        "api",
        "--method",
        "PUT",
        `repos/${repo}/environments/release`,
        "--input",
        "-",
      ],
      { input: "{}" },
    );
  }
  const key = readFileSync(keyPath);
  try {
    command(
      "gh",
      [
        "secret",
        "set",
        "TAURI_SIGNING_PRIVATE_KEY",
        "--repo",
        repo,
        "--env",
        "release",
      ],
      { input: key },
    );
  } finally {
    key.fill(0);
  }
  command(
    "gh",
    [
      "secret",
      "set",
      "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
      "--repo",
      repo,
      "--env",
      "release",
    ],
    { input: password },
  );
  command("gh", ["variable", "set", "AR_UPDATER_PUBLIC_KEY", "--repo", repo], {
    input: readFileSync(`${keyPath}.pub`),
  });
  command("gh", ["variable", "set", "AR_MICROSOFT_CLIENT_ID", "--repo", repo], {
    input: "a638a66e-7242-4bbe-b197-631d1ce1d7fb",
  });
  console.log(
    `Release credentials configured. Keep ${resolve(keyPath)} and its password backed up privately. Review GitHub's release environment protection settings. No release was published.`,
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
