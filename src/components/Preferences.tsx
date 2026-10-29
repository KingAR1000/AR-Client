import { useState } from "react";

import { ArrowUpRight, ExternalLink, SlidersHorizontal } from "lucide-react";

import { request, type LauncherState } from "../api";

import type { Run } from "../api";
export default function Preferences({
  state,
  run,
  open,
  busy,
}: {
  state: LauncherState;
  run: Run;
  open: (url: string) => void;
  busy: boolean;
}) {
  const [id, setId] = useState(state.settings.microsoftClientId),
    [eula, setEula] = useState(state.settings.eulaAccepted),
    [key, setKey] = useState("");
  return (
    <div className="settings-layout">
      <section className="panel">
        <span className="eyebrow">CONNECTIONS</span>
        <h3>Service configuration</h3>
        <p className="muted">
          AR Client needs its own registered Microsoft application to
          authenticate players.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run("Save settings", () =>
              request("settings.save", {
                microsoftClientId: id,
                eulaAccepted: eula,
              }),
            );
          }}
        >
          <label>
            Microsoft public client ID
            <input
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="Application (client) ID — see README"
              autoComplete="off"
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={eula}
              onChange={(e) => setEula(e.target.checked)}
            />
            <span>I have read and agree to the Minecraft EULA.</span>
          </label>
          <button
            type="button"
            className="text-button"
            onClick={() => open("https://www.minecraft.net/eula")}
          >
            Read Minecraft EULA <ExternalLink size={14} />
          </button>
          <div className="panel-footer">
            <button className="primary" disabled={busy}>
              Save settings
            </button>
          </div>
        </form>
      </section>
      <section className="panel">
        <h3>CurseForge connection</h3>
        <p className="muted">
          {state.curseforgeConfigured
            ? "Your personal key is saved in your OS credential vault and connects directly to CurseForge."
            : "Uses the AR Client catalog service when deployed. You can optionally add your own key to connect directly. Modrinth needs no key."}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run("Save CurseForge key", async () => {
              await request("curseforge.key", { key });
              setKey("");
            });
          }}
        >
          <label>
            Personal API key (optional)
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              autoComplete="new-password"
              placeholder="Stored securely, never in source code"
            />
          </label>
          <button className="secondary" disabled={busy || !key}>
            Save key
          </button>
          {state.curseforgeConfigured && (
            <button
              type="button"
              className="text-button"
              onClick={() =>
                run("Remove CurseForge key", () =>
                  request("curseforge.key", { key: "" }),
                )
              }
            >
              Remove saved key
            </button>
          )}
        </form>
      </section>
      <section className="panel wide">
        <h3>Performance & Java</h3>
        <p className="muted">
          Memory and Java are configured per installation. Applying a preset
          changes video settings and installs compatible Sodium and Lithium
          releases for Fabric.
        </p>
        {state.profiles.map((p) => (
          <div className="installation-row" key={p.id}>
            <SlidersHorizontal size={20} />
            <div className="grow">
              <h3>{p.name}</h3>
              <small>
                {p.preset} · {p.ram / 1024} GB ·{" "}
                {p.java || "Automatic Java runtime"}
              </small>
            </div>
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                run("Apply performance preset", () =>
                  request("preset.apply", { profile: p.id }),
                )
              }
            >
              Apply preset
            </button>
          </div>
        ))}
      </section>
      <section className="panel wide">
        <h3>About AR Client</h3>
        <p className="muted">
          Version {state.version} · GNU GPL v3.0 · Created by KingAR1000
        </p>
        <p className="muted">
          No ads. No telemetry. Not affiliated with Mojang or Microsoft.
        </p>
        <button
          className="text-button"
          onClick={() => open("https://github.com/KingAR1000/AR-Client")}
        >
          Source code & contribution guide <ArrowUpRight size={16} />
        </button>
      </section>
    </div>
  );
}
