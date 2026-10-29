import { useEffect, useState } from "react";

import { ArrowUpRight, Download, RefreshCw } from "lucide-react";

import { request, type Profile } from "../api";

import type { Run } from "../api";
export default function Updates({
  profile,
  run,
  fail,
  open,
  busy,
  latest,
  refreshVersions,
}: {
  profile?: Profile;
  run: Run;
  fail: (e: unknown) => void;
  open: (url: string) => void;
  busy: boolean;
  latest: string;
  refreshVersions: () => Promise<void>;
}) {
  const [releases, setReleases] = useState<any[]>([]),
    [updates, setUpdates] = useState<any[] | null>(null),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    request<any[]>("releases").then(setReleases).catch(fail);
  }, []);
  async function check() {
    if (!profile) return;
    setLoading(true);
    try {
      setUpdates(await request("content.updates", { profile: profile.id }));
    } catch (e) {
      fail(e);
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <div className="settings-layout">
        <section className="panel">
          <span className="eyebrow">LAUNCHER</span>
          <h3>AR Client releases</h3>
          <p className="muted">
            Signed updates are accepted only after the project’s release public
            key is configured at build time.
          </p>
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              run("Check signed launcher update", async () => {
                const { check } = await import("@tauri-apps/plugin-updater");
                const update = await check();
                if (!update) return;
                if (
                  confirm(
                    `Install AR Client ${update.version}? The launcher will need to restart.`,
                  )
                )
                  await update.downloadAndInstall();
              })
            }
          >
            <RefreshCw size={16} />
            Check signed update
          </button>
        </section>
        <section className="panel">
          <span className="eyebrow">MINECRAFT</span>
          <h3>{latest || "Official release channel"}</h3>
          <p className="muted">
            Minecraft upgrades use a separate installation to keep existing
            worlds and mods safe. New installations default to the latest stable
            release; 1.21.9 is the oldest supported version.
          </p>
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              run("Check official Minecraft releases", refreshVersions)
            }
          >
            <RefreshCw size={16} /> Check official releases
          </button>
          <button
            className="text-button"
            onClick={() => open("https://www.minecraft.net/en-us/articles")}
          >
            Official release notes <ArrowUpRight size={16} />
          </button>
        </section>
      </div>
      <section className="panel">
        <div className="section-title">
          <h3>Content updates {profile && `/ ${profile.name}`}</h3>
          <button
            className="secondary"
            disabled={!profile || loading || busy}
            onClick={check}
          >
            <RefreshCw size={16} className={loading ? "spin" : ""} />
            Check installed content
          </button>
        </div>
        {updates?.map((u) => (
          <div className="installation-row" key={u.installed.filename}>
            <div className="grow">
              <h3>{u.installed.filename}</h3>
              <small>
                {u.available.version_number || u.available.displayName}
              </small>
            </div>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                run("Update content", async () => {
                  await request("content.install", {
                    profile: profile!.id,
                    source: u.installed.source,
                    project: u.installed.projectId,
                    kind: u.installed.kind,
                  });
                  await check();
                })
              }
            >
              Update <Download size={15} />
            </button>
          </div>
        ))}
        <p className="muted">
          {updates === null
            ? "Check your tracked mods and resource packs for compatible releases."
            : updates.length === 0
              ? "No compatible updates found."
              : ""}
        </p>
      </section>
      <section className="panel">
        <h3>Release history</h3>
        {releases.length ? (
          releases.map((r) => (
            <article className="release-entry" key={r.id}>
              <h3>{r.name || r.tag_name}</h3>
              <time>{new Date(r.published_at).toLocaleDateString()}</time>
              <pre>{r.body}</pre>
              <button className="text-button" onClick={() => open(r.html_url)}>
                View release <ArrowUpRight size={15} />
              </button>
            </article>
          ))
        ) : (
          <p className="muted">
            No published GitHub releases are available yet.
          </p>
        )}
      </section>
    </>
  );
}
