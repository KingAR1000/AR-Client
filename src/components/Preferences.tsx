import { useState } from "react";
import {
  ExternalLink,
  Settings2,
  UserRound,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import {
  request,
  type LauncherState,
  type Profile,
  type Page,
  type Run,
} from "../api";
export default function Preferences({
  state,
  run,
  open,
  busy,
  configure,
  navigate,
}: {
  state: LauncherState;
  run: Run;
  open: (url: string) => void;
  busy: boolean;
  configure: (profile: Profile) => void;
  navigate: (page: Page) => void;
}) {
  const [id, setId] = useState(state.settings.microsoftClientId),
    [eula, setEula] = useState(state.settings.eulaAccepted),
    [key, setKey] = useState("");
  const account = state.accounts.find((a) => a.id === state.activeAccount);
  return (
    <div className="night-settings">
      <section>
        <h2>
          <UserRound size={19} />
          Account
        </h2>
        <div className="night-row">
          <div>
            <h3>Microsoft account</h3>
            <p>
              {account
                ? `Signed in as ${account.name}.`
                : "AR Client needs a Microsoft account that owns Minecraft: Java Edition."}
            </p>
          </div>
          <button className="secondary" onClick={() => navigate("Accounts")}>
            {account ? "Manage accounts" : "Sign in with Microsoft"}
          </button>
        </div>
      </section>
      <section>
        <h2>
          <RefreshCw size={19} />
          Updates
        </h2>
        <div className="night-row">
          <div>
            <h3>Launcher & game updates</h3>
            <p>
              Review launcher releases, Minecraft versions and compatible
              content updates.
            </p>
          </div>
          <button className="secondary" onClick={() => navigate("Updates")}>
            Check updates
          </button>
        </div>
      </section>
      <section>
        <h2>
          <SlidersHorizontal size={19} />
          Performance & Java
        </h2>
        {state.profiles.length ? (
          state.profiles.map((p) => (
            <div className="night-row" key={p.id}>
              <div>
                <h3>{p.name}</h3>
                <p>
                  {p.preset} · {p.ram / 1024} GB RAM ·{" "}
                  {p.java || "Automatic Java"}
                </p>
              </div>
              <div className="row-buttons">
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
            </div>
          ))
        ) : (
          <div className="night-row">
            <div>
              <h3>Installation settings</h3>
              <p>
                Create an installation to configure Java, memory and
                performance.
              </p>
            </div>
            <button
              className="secondary"
              onClick={() => navigate("Installations")}
            >
              Installations
            </button>
          </div>
        )}
      </section>
      <section>
        <h2>
          <Settings2 size={19} />
          Launcher
        </h2>
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
          <div className="night-row">
            <div>
              <h3>Minecraft EULA</h3>
              <p>Review the EULA before launching Minecraft.</p>
              <button
                type="button"
                className="text-button"
                onClick={() => open("https://www.minecraft.net/eula")}
              >
                Read EULA <ExternalLink size={12} />
              </button>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={eula}
                onChange={(e) => setEula(e.target.checked)}
              />
              I agree to the Minecraft EULA
            </label>
          </div>
          <details className="night-row advanced-settings">
            <summary>Advanced authentication settings</summary>
            <label>
              Microsoft public client ID
              <input
                value={id}
                onChange={(e) => setId(e.target.value)}
                autoComplete="off"
              />
            </label>
            <p className="settings-note">
              AR Client's app ID is configured. Only change this for your own
              registered application.
            </p>
          </details>
          <div className="settings-save">
            <button className="primary" disabled={busy}>
              Save settings
            </button>
          </div>
        </form>
        <form
          className="night-row catalog-settings"
          onSubmit={(e) => {
            e.preventDefault();
            run("Save CurseForge key", async () => {
              await request("curseforge.key", { key });
              setKey("");
            });
          }}
        >
          <div>
            <h3>Mod catalogs</h3>
            <p>
              {state.curseforgeConfigured
                ? "Your personal CurseForge key is stored in your OS vault."
                : "Modrinth and CurseForge are configured. A personal key is optional."}
            </p>
          </div>
          <div className="row-buttons">
            <input
              aria-label="Personal CurseForge API key"
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              autoComplete="new-password"
              placeholder="Personal API key (optional)"
            />
            <button className="secondary" disabled={busy || !key}>
              Save key
            </button>
            {state.curseforgeConfigured && (
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  run("Remove CurseForge key", () =>
                    request("curseforge.key", { key: "" }),
                  )
                }
              >
                Remove
              </button>
            )}
          </div>
        </form>
        <div className="night-row">
          <div>
            <h3>About AR Client</h3>
            <p>Version {state.version} · KingAR1000 · GNU GPL v3.0</p>
            <p>Free forever. No ads. No telemetry.</p>
          </div>
          <button
            className="secondary"
            onClick={() => open("https://github.com/KingAR1000/AR-Client")}
          >
            Source code <ExternalLink size={14} />
          </button>
        </div>
      </section>
    </div>
  );
}
