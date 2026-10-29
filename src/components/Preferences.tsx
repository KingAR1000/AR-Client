import { useState } from "react";

import {
  ArrowUpRight,
  ExternalLink,
  Settings2,
  SlidersHorizontal,
} from "lucide-react";

import { request, type LauncherState, type Profile } from "../api";

import type { Run } from "../api";
export default function Preferences({
  state,
  run,
  open,
  busy,
  configure,
}: {
  state: LauncherState;
  run: Run;
  open: (url: string) => void;
  busy: boolean;
  configure: (profile: Profile) => void;
}) {
  const [id, setId] = useState(state.settings.microsoftClientId),
    [eula, setEula] = useState(state.settings.eulaAccepted),
    [key, setKey] = useState("");
  return (
    <div className="settings-layout">
      <section className="panel wide">
        <div className="settings-title">
          <SlidersHorizontal size={19} />
          <h3>Performance & Java</h3>
        </div>
        <p className="muted">
          Memory, Java, and performance presets are saved per installation.
        </p>
        {state.profiles.length ? (
          state.profiles.map((p) => (
            <div className="installation-row" key={p.id}>
              <div className="grow">
                <h3>{p.name}</h3>
                <small>
                  {p.preset} · {p.ram / 1024} GB RAM ·{" "}
                  {p.java || "Automatic Java"}
                </small>
              </div>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => configure(p)}
              >
                <Settings2 size={14} />
                Configure
              </button>
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
          ))
        ) : (
          <p className="settings-note">
            Create an installation to configure memory and performance.
          </p>
        )}
        <p className="settings-note">
          Fabric presets install compatible Sodium and Lithium releases and
          apply video settings.
        </p>
      </section>
      <section className="panel">
        <h3>Minecraft</h3>
        <p className="muted">
          Review the Minecraft EULA before your first launch.
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
          <details className="advanced-settings">
            <summary>Advanced authentication settings</summary>
            <label>
              Microsoft public client ID
              <input
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="Application (client) ID — see README"
                autoComplete="off"
              />
            </label>
            <p className="settings-note">
              AR Client’s public application ID is already configured. Only
              change it to use your own registered Microsoft app.
            </p>
          </details>
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
        <h3>Mod catalogs</h3>
        <p className="muted">
          {state.curseforgeConfigured
            ? "Your personal key is saved in your OS credential vault and connects directly to CurseForge."
            : "Browse Modrinth directly and CurseForge through the AR Client catalog service. A personal CurseForge key is optional."}
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
          Source code <ArrowUpRight size={16} />
        </button>
      </section>
    </div>
  );
}
