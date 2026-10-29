import { listen } from "@tauri-apps/api/event";
import {
  ArrowUpRight,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Folder,
  Home,
  Image,
  Layers,
  LoaderCircle,
  Move,
  Package,
  Play,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import type { Page } from "./api";
import {
  desktop,
  defaultRuntime,
  message,
  preferredRelease,
  request,
  type LauncherState,
  type Profile,
} from "./api";
import Accounts from "./components/Accounts";
import Catalog from "./components/Catalog";
import Empty from "./components/Empty";
import Hud from "./components/Hud";
import Preferences from "./components/Preferences";
import ProfileEditor from "./components/ProfileEditor";
import Updates from "./components/Updates";
import HomeScreen from "./components/Home";
import "./style.css";
const Skins = React.lazy(() => import("./components/Skins"));

const nav: [Page, typeof Home][] = [
  ["Home", Home],
  ["Play", Play],
  ["Installations", Layers],
  ["Mods", Box],
  ["Resource Packs", Image],
  ["Modpacks", Package],
  ["Skins", UserRound],
  ["Accounts", Users],
  ["HUD Editor", Move],
  ["Updates", Download],
  ["Settings", Settings],
];
const initial: LauncherState = {
  profiles: [],
  accounts: [],
  activeAccount: null,
  settings: { microsoftClientId: "", eulaAccepted: false },
  running: [],
  version: "0.1.0",
  curseforgeConfigured: false,
  companions: [],
};
type Progress = {
  stage: string;
  current: number;
  total: number;
  exited?: string;
};
function App() {
  const [page, setPage] = useState<Page>("Home"),
    [state, setState] = useState(initial),
    [selected, setSelected] = useState(""),
    [versions, setVersions] = useState<string[]>([]),
    [latest, setLatest] = useState(""),
    [busy, setBusy] = useState(""),
    [progress, setProgress] = useState<Progress | null>(null),
    [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
      null,
    ),
    [editing, setEditing] = useState<Profile | null>(null);
  const lock = useRef(false);
  const lastVersionCheck = useRef(0);
  const profile =
    state.profiles.find((p) => p.id === selected) || state.profiles[0];
  const account = state.accounts.find((a) => a.id === state.activeAccount);
  async function refresh() {
    const s = await request<LauncherState>("state");
    setState(s);
    if (s.settings.recoveredFromBackup)
      setNotice({
        text: "Configuration was recovered from its backup. The damaged file was preserved in your data folder. Save Settings to acknowledge.",
        error: true,
      });
    return s;
  }
  async function run<T>(
    label: string,
    fn: () => Promise<T>,
  ): Promise<T | undefined> {
    if (lock.current) return;
    lock.current = true;
    setBusy(label);
    setProgress(null);
    setNotice(null);
    try {
      const result = await fn();
      await refresh();
      setNotice({ text: `${label} — done`, error: false });
      return result;
    } catch (e) {
      setNotice({ text: message(e), error: true });
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  function fail(e: unknown) {
    setNotice({ text: message(e), error: true });
  }
  async function refreshVersions() {
    lastVersionCheck.current = Date.now();
    const result = await request<{
      latest: { release: string };
      versions: { id: string }[];
    }>("versions");
    setLatest(result.latest.release);
    setVersions(result.versions.map((version) => version.id));
  }
  useEffect(() => {
    if (!desktop) return;
    refresh().catch(fail);
    refreshVersions().catch(fail);
    const onFocus = () => {
      if (Date.now() - lastVersionCheck.current > 60_000)
        refreshVersions().catch(fail);
    };
    const versionTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") onFocus();
    }, 30 * 60_000);
    window.addEventListener("focus", onFocus);
    let unlisten: undefined | (() => void);
    let cancelled = false;
    listen<Progress>("progress", (e) => {
      setProgress(e.payload);
      if (e.payload.exited) refresh().catch(fail);
    }).then((f) => {
      if (cancelled) f();
      else unlisten = f;
    });
    return () => {
      cancelled = true;
      unlisten?.();
      window.clearInterval(versionTimer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  const newProfile = () => {
    const version = preferredRelease(latest, versions);
    setEditing({
      id: "",
      name: "My installation",
      version,
      ...defaultRuntime(version, state.companions),
      ram: 4096,
      java: "",
      preset: "Balanced",
    });
  };
  const open = (url: string) => request("link.open", { url }).catch(fail);
  return (
    <div className="shell">
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => setPage("Home")}
          aria-label="AR Client home"
        >
          <img src="/ar-mark.png" alt="AR" />
          <span>
            CLIENT<small>BY KINGAR1000</small>
          </span>
        </button>
        <nav aria-label="Main navigation">
          {nav.map(([name, Icon], i) => (
            <React.Fragment key={name}>
              {(i === 3 || i === 7 || i === 9) && (
                <div className="nav-divider" />
              )}
              <button
                className={`nav-item ${page === name ? "active" : ""}`}
                aria-current={page === name ? "page" : undefined}
                title={name}
                onClick={() => setPage(name)}
              >
                <Icon size={17} />
                <span>{name}</span>
              </button>
            </React.Fragment>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="account-card" onClick={() => setPage("Accounts")}>
            <div className="avatar">
              {account?.name.slice(0, 2).toUpperCase() || (
                <UserRound size={20} />
              )}
            </div>
            <span>
              {account?.name || "Not signed in"}
              <small>
                {account ? "Microsoft account" : "Sign in with Microsoft"}
              </small>
            </span>
            <ChevronRight size={16} />
          </button>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            <span className="topbar-name">AR Client</span>
            <span className="slash">/</span>
            <b>{page}</b>
          </span>
          <div>
            <span className="version-tag">v{state.version}</span>
            <button
              className="icon-button"
              title="Open data folder"
              onClick={() => request("folder.open").catch(fail)}
            >
              <Folder size={17} />
            </button>
            <button
              className="icon-button"
              title="Project on GitHub"
              onClick={() => open("https://github.com/KingAR1000/AR-Client")}
            >
              <ArrowUpRight size={18} />
            </button>
          </div>
        </header>
        {!desktop && (
          <div className="environment-banner">
            Browser preview · Sign-in, installs, and launching are available in
            the desktop app.
          </div>
        )}
        <div className={`content ${page === "Home" ? "home-content" : ""}`}>
          {page !== "Home" && (
            <div className="page-heading">
              <div>
                <h1>{page}</h1>
                <p>{descriptions[page]}</p>
              </div>
              {page === "Installations" ? (
                <button className="primary" onClick={newProfile}>
                  <Plus size={17} />
                  New installation
                </button>
              ) : (
                <button
                  className="profile-switch"
                  onClick={() => setPage("Play")}
                >
                  <span className="tiny-block" />
                  <span>
                    {profile?.name || "Create an installation"}
                    <small>
                      {profile
                        ? `${profile.version} · ${profile.loader}`
                        : "Start with your Minecraft version"}
                    </small>
                  </span>
                  <ChevronDown size={15} />
                </button>
              )}
            </div>
          )}
          {page === "Home" && (
            <HomeScreen
              account={account}
              profiles={state.profiles}
              profile={profile}
              latest={latest}
              busy={busy}
              running={state.running}
              select={setSelected}
              navigate={setPage}
              create={newProfile}
              launch={() =>
                profile &&
                run("Launch Minecraft", () =>
                  request("launch", { id: profile.id }),
                )
              }
            />
          )}
          {page === "Play" && (
            <section className="panel">
              <div className="section-title">
                <h3>Choose your installation</h3>
                <button className="secondary" onClick={newProfile}>
                  <Plus size={16} />
                  Create new
                </button>
              </div>
              {!state.profiles.length ? (
                <Empty
                  title="No installations yet"
                  text="Create an isolated installation, then connect your Microsoft account."
                  action="Create installation"
                  onClick={newProfile}
                />
              ) : (
                <div className="profile-grid">
                  {state.profiles.map((p) => (
                    <button
                      key={p.id}
                      className={`profile-tile ${profile?.id === p.id ? "selected" : ""}`}
                      onClick={() => setSelected(p.id)}
                    >
                      <div className="tile-icon">
                        <Box size={28} />
                      </div>
                      <h3>{p.name}</h3>
                      <p>
                        {p.version} · {p.loader}
                      </p>
                      <span>
                        {p.ram / 1024} GB RAM · {p.preset}
                      </span>
                      {profile?.id === p.id && (
                        <Check className="selected-check" size={17} />
                      )}
                    </button>
                  ))}
                </div>
              )}
              {profile && (
                <div className="panel-footer">
                  <span>
                    {account
                      ? `Playing as ${account.name}`
                      : "Microsoft sign-in required to play"}
                  </span>
                  <button
                    className="secondary"
                    disabled={!!busy}
                    onClick={() =>
                      run("Verify installation", () =>
                        request("install", { id: profile.id }),
                      )
                    }
                  >
                    <Download size={16} />
                    Install / repair
                  </button>
                  <button
                    className="primary"
                    disabled={!!busy || state.running.includes(profile.id)}
                    onClick={() =>
                      run("Launch Minecraft", () =>
                        request("launch", { id: profile.id }),
                      )
                    }
                  >
                    <Play size={17} />
                    {state.running.includes(profile.id)
                      ? "Minecraft is running"
                      : "Launch Minecraft"}
                  </button>
                </div>
              )}
            </section>
          )}
          {page === "Installations" && (
            <section className="panel">
              {!state.profiles.length ? (
                <Empty
                  title="No installations yet"
                  text="Keep survival, modpacks, and creative worlds separate."
                  action="Create installation"
                  onClick={newProfile}
                />
              ) : (
                state.profiles.map((p) => (
                  <div className="installation-row" key={p.id}>
                    <div className="tile-icon">
                      <Layers />
                    </div>
                    <div className="grow">
                      <h3>{p.name}</h3>
                      <p>
                        {p.version} · {p.loader}
                        {p.loaderVersion ? " " + p.loaderVersion : ""} ·{" "}
                        {p.ram / 1024} GB
                      </p>
                    </div>
                    <button className="secondary" onClick={() => setEditing(p)}>
                      Configure
                    </button>
                    <button
                      className="icon-button"
                      disabled={!!busy}
                      title="Repair files"
                      onClick={() =>
                        run("Repair installation", () =>
                          request("install", { id: p.id }),
                        )
                      }
                    >
                      <RefreshCw size={17} />
                    </button>
                    <button
                      className="icon-button"
                      disabled={!!busy}
                      title="Duplicate installation"
                      onClick={() =>
                        run("Duplicate installation", () =>
                          request("profile.duplicate", { id: p.id }),
                        )
                      }
                    >
                      <Copy size={17} />
                    </button>
                    <button
                      className="icon-button"
                      title="Open folder"
                      onClick={() =>
                        request("folder.open", { id: p.id }).catch(fail)
                      }
                    >
                      <Folder size={17} />
                    </button>
                    <button
                      className="icon-button danger"
                      disabled={!!busy}
                      title="Move installation to trash"
                      onClick={() => {
                        if (
                          confirm(
                            `Move “${p.name}” to the launcher’s trash folder? Worlds are retained there.`,
                          )
                        )
                          run("Remove installation", () =>
                            request("profile.delete", { id: p.id }),
                          );
                      }}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                ))
              )}
            </section>
          )}
          {(["Mods", "Resource Packs", "Modpacks"] as Page[]).includes(
            page,
          ) && (
            <Catalog
              key={`${page}-${profile?.id}`}
              page={page}
              profile={profile}
              run={run}
              fail={fail}
              busy={!!busy}
              create={newProfile}
            />
          )}
          {page === "Accounts" && (
            <Accounts
              state={state}
              run={run}
              fail={fail}
              refresh={refresh}
              open={open}
              settings={() => setPage("Settings")}
            />
          )}
          {page === "Skins" && (
            <React.Suspense
              fallback={<div className="loading">Loading skin viewer…</div>}
            >
              <Skins state={state} run={run} fail={fail} busy={!!busy} />
            </React.Suspense>
          )}
          {page === "Settings" && (
            <Preferences
              state={state}
              run={run}
              open={open}
              busy={!!busy}
              configure={setEditing}
            />
          )}
          {page === "Updates" && (
            <Updates
              profile={profile}
              run={run}
              fail={fail}
              open={open}
              busy={!!busy}
              latest={latest}
              refreshVersions={refreshVersions}
            />
          )}
          {page === "HUD Editor" && (
            <Hud
              profile={profile}
              companions={state.companions}
              run={run}
              fail={fail}
            />
          )}
          <footer className="footer">
            <span>Minecraft Java Edition</span>
            <button onClick={() => open("https://kingar1000.xyz")}>
              KINGAR1000 <ArrowUpRight size={12} />
            </button>
          </footer>
        </div>
        {(busy || progress) && (
          <div className="download-bar">
            <LoaderCircle size={16} className={busy ? "spin" : ""} />
            <span>
              {busy || progress?.stage}
              <small>{busy && progress?.stage}</small>
            </span>
            {progress && (
              <>
                <div className="progress-track">
                  <div
                    style={{
                      width: `${Math.min(100, (progress.current / Math.max(1, progress.total)) * 100)}%`,
                    }}
                  />
                </div>
                <span className="subtle">
                  {progress.current} / {progress.total}
                </span>
              </>
            )}
            {!busy && (
              <button
                className="icon-button"
                aria-label="Dismiss progress"
                onClick={() => setProgress(null)}
              >
                <X size={15} />
              </button>
            )}
          </div>
        )}
        {notice && (
          <div role="alert" className={`toast ${notice.error ? "error" : ""}`}>
            <span>{notice.error ? "!" : <Check size={16} />}</span>
            <p>{notice.text}</p>
            <button
              aria-label="Dismiss notification"
              onClick={() => setNotice(null)}
            >
              <X size={17} />
            </button>
          </div>
        )}
      </main>
      {editing && (
        <ProfileEditor
          profile={editing}
          versions={versions}
          latest={latest}
          close={() => setEditing(null)}
          save={(p) =>
            run("Save installation", async () => {
              const result = await request<Profile>("profile.save", p);
              setSelected(result.id);
              setEditing(null);
              return result;
            })
          }
          fail={fail}
        />
      )}
    </div>
  );
}
const descriptions: Record<Page, string> = {
  Home: "Minecraft Java Edition",
  Play: "Select an installation and launch Minecraft.",
  Installations: "Manage game versions, modloaders, and instance settings.",
  Mods: "Browse and manage compatible mods.",
  "Resource Packs": "Browse, install, and reorder resource packs.",
  Modpacks: "Discover modpacks for your installation.",
  Skins: "Your skin library and owned capes.",
  Accounts: "Your Minecraft identities, securely stored.",
  Updates: "Launcher releases and compatible content updates.",
  Settings: "Performance, Java, and launcher preferences.",
  "HUD Editor": "Position and customize your in-game widgets.",
};
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
