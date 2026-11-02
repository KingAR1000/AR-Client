import { useState } from "react";
import { ArrowUpRight, Download, Play } from "lucide-react";
import { request, type LauncherState, type Profile, type Run } from "../api";
import Empty from "./Empty";
export default function RustEdition({
  state,
  profile,
  run,
  busy,
  open,
  navigate,
}: {
  state: LauncherState;
  profile?: Profile;
  run: Run;
  busy: boolean;
  open: (url: string) => void;
  navigate: () => void;
}) {
  const [accepted, setAccepted] = useState(false);
  const compatible = profile?.version === "26.3";
  const running = !!profile && state.running.includes("horizon:" + profile.id);
  return (
    <>
      <section className="panel rust-intro">
        <span className="eyebrow">
          POWERED BY HORIZON · EXPERIMENTAL NIGHTLY
        </span>
        <h2>Minecraft 26.3, in Rust.</h2>
        <p className="muted">
          Horizon is an independent, unofficial implementation of Minecraft Java
          Edition. It requires your licensed copy and a verified Microsoft
          account. Its upstream project documents gameplay differences and
          missing features.
        </p>
        <button
          className="text-button"
          onClick={() => open("https://github.com/horizon-rust/horizon")}
        >
          Horizon source & compatibility status <ArrowUpRight size={15} />
        </button>
        <div className="rust-facts">
          <span>
            <strong>Separate worlds</strong>
            <small>Rust saves stay outside Java installations.</small>
          </span>
          <span>
            <strong>Native renderer</strong>
            <small>Windows needs Vulkan or DirectX 12.</small>
          </span>
          <span>
            <strong>Different mod support</strong>
            <small>Java mod jars and AR Fabric HUD do not run here.</small>
          </span>
        </div>
      </section>
      {!compatible ? (
        <section className="panel">
          <Empty
            title="Select a Minecraft 26.3 installation"
            text="AR Client uses that installation's name and memory settings; Horizon gets its own game directory."
            action="Choose installation"
            onClick={navigate}
          />
        </section>
      ) : (
        <section className="panel">
          <div className="section-title">
            <div>
              <h3>{profile.name} · Rust Edition</h3>
              <small>
                26.3 · {profile.ram / 1024} GB RAM · signed Horizon Nightly
              </small>
            </div>
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            I understand this is experimental third-party software with
            different compatibility from Java Edition.
          </label>
          <p className="muted">
            First setup verifies Horizon's release signature, downloads the
            owner's Minecraft files from Mojang, and prepares resources locally.
            This can take several minutes.
          </p>
          <div className="panel-footer">
            <button
              className="secondary"
              disabled={busy || running || !accepted}
              onClick={() =>
                run("Prepare Rust Edition", () =>
                  request("horizon.prepare", {
                    id: profile.id,
                    nightlyAccepted: accepted,
                  }),
                )
              }
            >
              <Download size={16} />
              Install / verify
            </button>
            <button
              className="primary"
              disabled={busy || running || !accepted}
              onClick={() =>
                run("Launch Rust Edition", () =>
                  request("horizon.launch", {
                    id: profile.id,
                    nightlyAccepted: accepted,
                  }),
                )
              }
            >
              <Play size={16} />
              {running ? "Running" : "Play Rust Edition"}
            </button>
          </div>
        </section>
      )}
    </>
  );
}
