import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { listen } from "@tauri-apps/api/event";
import {
  Home,
  Play,
  Layers,
  Box,
  Image,
  Package,
  UserRound,
  Users,
  Download,
  Settings,
  ChevronRight,
  Plus,
  ArrowUpRight,
  Search,
  Folder,
  Trash2,
  Copy,
  RefreshCw,
  X,
  Check,
  SlidersHorizontal,
  Move,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  LoaderCircle,
  ShieldCheck,
  Terminal,
  ChevronDown,
} from "lucide-react";

import {
  request,
  desktop,
  message,
  fileData,
  loaderChoices,
  type Profile,
  type LauncherState,
  type Content,
} from "./api";
import "./style.css";
import type { Page } from "./api";
import Empty from "./components/Empty";
import ProfileEditor from "./components/ProfileEditor";
import Catalog from "./components/Catalog";
import Accounts from "./components/Accounts";
import Preferences from "./components/Preferences";
import Updates from "./components/Updates";
import Hud from "./components/Hud";
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
  const profile =
    state.profiles.find((p) => p.id === selected) || state.profiles[0];
  const account = state.accounts.find((a) => a.id === state.activeAccount);
  async function refresh() {
    const s = await request<LauncherState>("state");
    setState(s);
    return s;
  }
  async function run<T>(
    label: string,
    fn: () => Promise<T>,
  ): Promise<T | undefined> {
    if (lock.current) return;
    lock.current = true;
    setBusy(label);
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
  useEffect(() => {
    if (!desktop) return;
    refresh().catch(fail);
    request<{ latest: { release: string }; versions: { id: string }[] }>(
      "versions",
    )
      .then((v) => {
        setLatest(v.latest.release);
        setVersions(v.versions.map((x) => x.id));
      })
      .catch(fail);
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
    };
  }, []);
  const newProfile = () =>
    setEditing({
      id: "",
      name: "My installation",
      version: latest || versions[0] || "",
      loader: "fabric",
      loaderVersion: "",
      ram: 4096,
      java: "",
      preset: "Balanced",
    });
  const open = (url: string) => request("link.open", { url }).catch(fail);
  return (
    <div className="shell">
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => setPage("Home")}
          aria-label="AR Client home"
        >
          <img src="/ar.jpg" alt="AR" />
          <span>
            CLIENT<small>BY KINGAR1000</small>
          </span>
        </button>
        <div className="nav-label">YOUR SPACE</div>
        <nav>
          {nav.map(([name, Icon], i) => (
            <React.Fragment key={name}>
              {i === 9 && <div className="nav-divider" />}
              <button
                className={`nav-item ${page === name ? "active" : ""}`}
                onClick={() => setPage(name)}
              >
                <Icon size={17} />
                <span>{name}</span>
                {page === name && <span className="nav-dot" />}
              </button>
            </React.Fragment>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="edition">
            <span className="status-dot" />
            JAVA EDITION <span>64-BIT</span>
          </div>
          <button className="account-card" onClick={() => setPage("Accounts")}>
            <div className="avatar">
              {account?.name.slice(0, 2).toUpperCase() || (
                <UserRound size={20} />
              )}
            </div>
            <span>
              {account?.name || "Make yourself at home"}
              <small>
                {account ? "Microsoft account" : "Connect your account"}
              </small>
            </span>
            <ChevronRight size={16} />
          </button>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            AR CLIENT <span className="slash">/</span> <b>{page}</b>
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
            <Terminal size={16} />
            Desktop runtime required. Run <code>npm run desktop</code> to
            install, sign in, and play.
          </div>
        )}
        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {page === "Home"
                  ? "LESS BETWEEN YOU AND THE GAME"
                  : "YOUR CLIENT. YOUR WAY."}
              </div>
              <h1>
                {page === "Home"
                  ? `Welcome ${account ? "back, " + account.name : "to your next world"}.`
                  : page}
              </h1>
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
          {page === "Home" && (
            <>
              <section className="hero">
                <div className="hero-grid" />
                <div className="hero-geometry">
                  <div />
                  <div />
                  <div />
                  <div />
                  <div />
                </div>
                <div className="hero-copy">
                  <div className="pill">
                    <span className="status-dot" />
                    FREE. OPEN SOURCE. YOURS.
                  </div>
                  <img
                    className="wordmark"
                    src="/ar-client.jpg"
                    alt="AR Client"
                  />
                  <h2>
                    A better way
                    <br />
                    to play.
                  </h2>
                  <p>Your worlds. Your mods. Nothing in the way.</p>
                  <div className="hero-actions">
                    <button
                      className="primary play-button"
                      disabled={
                        !!busy ||
                        (!!profile && state.running.includes(profile.id))
                      }
                      onClick={() =>
                        profile
                          ? run("Launch Minecraft", () =>
                              request("launch", { id: profile.id }),
                            )
                          : newProfile()
                      }
                    >
                      <Play size={18} fill="currentColor" />
                      {profile ? "Launch Minecraft" : "Get started"}
                      <ChevronRight size={18} />
                    </button>
                    <span>
                      {profile
                        ? `${profile.version} / ${profile.loader.toUpperCase()}`
                        : "MINECRAFT JAVA EDITION"}
                    </span>
                  </div>
                </div>
                <div className="hero-caption">
                  <span>01 / YOUR NEXT ADVENTURE</span>
                  <span>NO LIMITS. NO ADS.</span>
                </div>
              </section>
              <div className="home-grid">
                <section className="panel quick-panel">
                  <div className="section-title">
                    <h3>Ready when you are</h3>
                    <span className="subtle">QUICK ACCESS</span>
                  </div>
                  <button
                    className="quick-row"
                    onClick={() => setPage("Installations")}
                  >
                    <Layers />
                    <span>
                      Your installations
                      <small>
                        {state.profiles.length} isolated{" "}
                        {state.profiles.length === 1 ? "instance" : "instances"}
                      </small>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                  <button className="quick-row" onClick={() => setPage("Mods")}>
                    <Box />
                    <span>
                      Make it your Minecraft
                      <small>Discover mods on Modrinth & CurseForge</small>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                  <button
                    className="quick-row"
                    onClick={() => setPage("Skins")}
                  >
                    <UserRound />
                    <span>
                      A look of your own
                      <small>Manage skins and owned capes</small>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                </section>
                <section className="panel release-panel">
                  <span className="eyebrow">FROM MOJANG</span>
                  <h3>
                    {latest
                      ? `Minecraft ${latest}`
                      : "Official release channel"}
                  </h3>
                  <p>
                    {latest
                      ? "The latest release, verified against Mojang’s official manifest. Choose it when creating an installation."
                      : "Connect the desktop launcher to check the latest official Minecraft release."}
                  </p>
                  <button
                    className="text-button"
                    onClick={() => setPage("Updates")}
                  >
                    Open update center <ArrowUpRight size={16} />
                  </button>
                  <div className="release-footer">
                    <ShieldCheck size={16} />
                    Verified downloads. Separate worlds.
                  </div>
                </section>
              </div>
            </>
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
                  title="Your first world starts here"
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
                  title="A place for every play style"
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
            <Preferences state={state} run={run} open={open} busy={!!busy} />
          )}
          {page === "Updates" && (
            <Updates
              profile={profile}
              run={run}
              fail={fail}
              open={open}
              busy={!!busy}
              latest={latest}
            />
          )}
          {page === "HUD Editor" && (
            <Hud profile={profile} run={run} fail={fail} />
          )}
          <footer className="footer">
            <span>Built for the game. Owned by the community.</span>
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
  Home: "Everything you need. Only what you want.",
  Play: "Pick your world. We’ll handle the rest.",
  Installations: "Different worlds. A space for each one.",
  Mods: "Find your next favorite addition.",
  "Resource Packs": "Change the way you see your world.",
  Modpacks: "A whole new experience, in one collection.",
  Skins: "Look like yourself. Or someone entirely different.",
  Accounts: "Your Minecraft identities, securely stored.",
  Updates: "Keep your entire setup in step.",
  Settings: "The details that make it yours.",
  "HUD Editor": "Put the essentials exactly where you want them.",
};
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
