import { writeFileSync } from "node:fs";
const pubkey = process.env.AR_UPDATER_PUBLIC_KEY;
if (!pubkey)
  throw new Error(
    "Set the AR_UPDATER_PUBLIC_KEY repository variable before building signed releases.",
  );
writeFileSync(
  "src-tauri/release.conf.json",
  JSON.stringify(
    {
      bundle: { createUpdaterArtifacts: true },
      plugins: {
        updater: {
          pubkey,
          endpoints: [
            "https://github.com/KingAR1000/AR-Client/releases/latest/download/latest.json",
          ],
        },
      },
    },
    null,
    2,
  ),
);
