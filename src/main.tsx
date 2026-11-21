import { listen } from "@tauri-apps/api/event";
import {
  ArrowUpRight,
  Box,
  Check,
  ChevronDown,
  Copy,
  Cpu,
  Download,
  Folder,
  Home,
  Image,
  Layers,
  LoaderCircle,
  MessageSquare,
  Move,
  Package,
  Play,
  Plus,
  RefreshCw,
  Search,
  Server,
  Settings,
  Trash2,
  TriangleAlert,
  UserRound,
  Users,
  X,
} from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";

import type { Notify, Page } from "./api";
import {
  desktop,
  defaultRuntime,
  message,
  preferredRelease,
  preview,
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
import Friends from "./components/Friends";
import Servers from "./components/Servers";
import RustEdition from "./components/RustEdition";
import Head from "./components/Head";
import Palette, { type Command } from "./components/Palette";
import { useSocial } from "./social";
import "./style.css";
const Skins = React.lazy(() => import("./components/Skins"));

const nav: [string, [Page, typeof Home][]][] = [
  [
    "Play",
    [
      ["Home", Home],
      ["Installations", Layers],
      ["Servers", Server],
    ],
  ],
  [
    "Library",
    [
      ["Mods", Box],
      ["Resource Packs", Image],
      ["Modpacks", Package],
      ["Skins", UserRound],
      ["HUD Editor", Move],
    ],
  ],
  ["Social", [["Friends", MessageSquare]]],
  [
    "More",
    [
      ["Rust Edition", Cpu],
      ["Updates", Download],
      ["Accounts", Users],
      ["Settings", Settings],
    ],
  ],
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
type Notice = Parameters<Notify>[0] & { id: number };
function App() {
  const [page, setPage] = useState<Page>(
      () =>
        ((preview && decodeURIComponent(location.hash.slice(1))) as Page) ||
        "Home",
    ),
    [state, setState] = useState(initial),
    [selected, setSelected] = useState(
      () => localStorage.getItem("ar.selected") || "",
    ),
    [versions, setVersions] = useState<string[]>([]),
    [latest, setLatest] = useState(""),
    [busy, setBusy] = useState(""),
    [progress, setProgress] = useState<Progress | null>(null),
    [notices, setNotices] = useState<Notice[]>([]),
    [palette, setPalette] = useState(false),
    [chatPeer, setChatPeer] = useState(""),
    [editing, setEditing] = useState<Profile | null>(null);
  const lock = useRef(false);
  const lastVersionCheck = useRef(0);
  const noticeId = useRef(0);
  const profile =
    state.profiles.find((p) => p.id === selected) || state.profiles[0];
  const account = state.accounts.find((a) => a.id === state.activeAccount);
  const dismiss = (id: number) =>
    setNotices((n) => n.filter((x) => x.id !== id));
  const notify: Notify = useCallback((notice) => {
    const id = ++noticeId.current;
    setNotices((n) => [...n.slice(-3), { ...notice, id }]);
    if (!notice.error)
      window.setTimeout(
        () => setNotices((n) => n.filter((x) => x.id !== id)),
        notice.action ? 9000 : 4500,
      );
  }, []);
  const openChat = useCallback((peer = "") => {
    setChatPeer(peer);
    setPage("Friends");
  }, []);
  const playing = state.profiles.find((p) => state.running.includes(p.id));
  const social = useSocial({
    account: state.activeAccount,
    activity: playing
      ? `Playing ${playing.version}${playing.loader !== "vanilla" ? ` · ${playing.loader}` : ""}`
      : "In the launcher",
    focused: page === "Friends",
    viewing: page === "Friends" ? chatPeer : "",
    notify,
    open: openChat,
  });
  useEffect(() => {
    if (selected) localStorage.setItem("ar.selected", selected);
  }, [selected]);
  async function refresh() {
    const s = await request<LauncherState>("state");
    setState(s);
    if (s.settings.recoveredFromBackup)
      notify({
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
    try {
      const result = await fn();
      await refresh();
      notify({ text: `${label} — done` });
      return result;
    } catch (e) {
      notify({ text: message(e), error: true, title: label });
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  function fail(e: unknown) {
    notify({ text: message(e), error: true });
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
    if (!desktop && !preview) return;
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
    if (desktop)
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
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      } else if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        setPage("Settings");
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
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
  const launch = (id: string) => {
    setSelected(id);
    return run("Launch Minecraft", () => request("launch", { id }));
  };
  const repair = (id: string) =>
    run("Verify installation", () => request("install", { id }));
  const open = (url: string) => request("link.open", { url }).catch(fail);
  const badge = social.unread + social.incoming;
  const commands = useMemo<Command[]>(
    () => [
      ...state.profiles.map((p) => ({
        id: "launch-" + p.id,
        group: "Play",
        label: `Launch ${p.name}`,
        hint: `${p.version} · ${p.loader}`,
        icon: <Play size={15} />,
        run: () => launch(p.id),
      })),
      {
        id: "new",
        group: "Play",
        label: "New installation",
        icon: <Plus size={15} />,
        run: newProfile,
      },
      ...nav.flatMap(([group, items]) =>
        items.map(([name, Icon]) => ({
          id: "page-" + name,
          group: "Go to",
          label: name,
          hint: group,
          icon: <Icon size={15} />,
          run: () => setPage(name),
        })),
      ),
      ...(social.snapshot?.peers || [])
        .filter((p) => p.status === "accepted")
        .map((p) => ({
          id: "chat-" + p.id,
          group: "Friends",
          label: `Message ${p.name}`,
          hint: p.online ? "Online" : "Offline",
          icon: <MessageSquare size={15} />,
          run: () => openChat(p.id),
        })),
      {
        id: "folder",
        group: "Tools",
        label: "Open data folder",
        icon: <Folder size={15} />,
        run: () => request("folder.open").catch(fail),
      },
      ...(profile
        ? [
            {
              id: "repair",
              group: "Tools",
              label: `Repair ${profile.name}`,
              icon: <RefreshCw size={15} />,
              run: () => repair(profile.id),
            },
          ]
        : []),
    ],
    [state.profiles, social.snapshot, profile, latest, versions],
  );
  return (
    <div className="shell">
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => setPage("Home")}
          aria-label="AR Client home"
        >
          <img src="/app-icon.png" alt="" />
          <span>
            AR Client
            <small>v{state.version}</small>
          </span>
        </button>
        <button className="search-trigger" onClick={() => setPalette(true)}>
          <Search size={14} />
          <span>Search</span>
          <kbd>Ctrl K</kbd>
        </button>
        <nav className="side-nav" aria-label="Main navigation">
          {nav.map(([group, items]) => (
            <div key={group} className="nav-group">
              <span className="nav-label">{group}</span>
              {items.map(([name, Icon]) => (
                <button
                  key={name}
                  className={page === name ? "active" : ""}
                  aria-current={page === name ? "page" : undefined}
                  onClick={() => setPage(name)}
                >
                  <Icon size={16} />
                  <span className="grow">{name}</span>
                  {name === "Friends" && badge > 0 && (
                    <b className="badge">{badge > 99 ? "99+" : badge}</b>
                  )}
                  {name === "Friends" && !badge && social.online.length > 0 && (
                    <span className="online-count">{social.online.length}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>
        {social.online.length > 0 && (
          <button className="online-strip" onClick={() => openChat()}>
            <span className="heads">
              {social.online.slice(0, 4).map((p) => (
                <Head key={p.id} name={p.name} skin={p.skin} size={22} />
              ))}
            </span>
            <small>{social.online.length} online</small>
          </button>
        )}
        <button
          className="account-card"
          onClick={() => setPage("Accounts")}
          aria-label={
            account ? `Account: ${account.name}` : "Sign in with Microsoft"
          }
        >
          {account ? (
            <Head
              name={account.name}
              skin={account.skin}
              size={32}
              online={social.status === "online" ? true : undefined}
            />
          ) : (
            <span className="head empty-head">
              <UserRound size={16} />
            </span>
          )}
          <span className="grow">
            <strong>{account?.name || "Sign in"}</strong>
            <small>
              {account
                ? state.accounts.length > 1
                  ? `${state.accounts.length} accounts`
                  : "Microsoft account"
                : "Microsoft account required"}
            </small>
          </span>
          <ChevronDown size={14} />
        </button>
      </aside>
      <main>
        {!desktop && (
          <div className="environment-banner">
            <TriangleAlert size={14} />
            {preview
              ? "Interface preview with sample data · nothing here is real."
              : "Browser preview · Sign-in, installs and launching are available in the desktop app."}
          </div>
        )}
        <div
          className={`content ${page === "Home" ? "home-content" : ""} ${page === "Friends" ? "friends-content" : ""}`}
        >
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
              ) : ["Settings", "Friends", "Accounts", "Updates"].includes(
                  page,
                ) ? null : (
                <button
                  className="profile-switch"
                  onClick={() => setPage("Play")}
                >
                  <span className="block-icon">
                    <Box size={15} />
                  </span>
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
              social={social}
              select={setSelected}
              navigate={setPage}
              create={newProfile}
              launch={launch}
              repair={repair}
              chat={openChat}
              openFolder={() =>
                request("folder.open", profile ? { id: profile.id } : {}).catch(
                  fail,
                )
              }
              configure={() => (profile ? setEditing(profile) : newProfile())}
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
                        <Box size={24} />
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
                    onClick={() => repair(profile.id)}
                  >
                    <Download size={16} />
                    Install / repair
                  </button>
                  <button
                    className="primary"
                    disabled={!!busy || state.running.includes(profile.id)}
                    onClick={() => launch(profile.id)}
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
            <section className="panel flush">
              {!state.profiles.length ? (
                <Empty
                  title="No installations yet"
                  text="Keep survival, modpacks, and creative worlds separate."
                  action="Create installation"
                  onClick={newProfile}
                />
              ) : (
                state.profiles.map((p) => (
                  <div
                    className={`installation-row ${profile?.id === p.id ? "current" : ""}`}
                    key={p.id}
                  >
                    <div className="tile-icon">
                      <Layers size={18} />
                    </div>
                    <div className="grow">
                      <h3>
                        {p.name}
                        {state.running.includes(p.id) && (
                          <span className="chip live">Running</span>
                        )}
                        {latest && p.version !== latest && (
                          <span className="chip" title={`Latest is ${latest}`}>
                            Update available
                          </span>
                        )}
                      </h3>
                      <p>
                        {p.version} · {p.loader}
                        {p.loaderVersion ? " " + p.loaderVersion : ""} ·{" "}
                        {p.ram / 1024} GB · {p.preset}
                      </p>
                    </div>
                    <button
                      className="primary small"
                      disabled={
                        !!busy || !account || state.running.includes(p.id)
                      }
                      onClick={() => launch(p.id)}
                    >
                      <Play size={14} fill="currentColor" />
                      Play
                    </button>
                    <button
                      className="secondary small"
                      onClick={() => setEditing(p)}
                    >
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
                      <RefreshCw size={16} />
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
                      <Copy size={16} />
                    </button>
                    <button
                      className="icon-button"
                      title="Open folder"
                      onClick={() =>
                        request("folder.open", { id: p.id }).catch(fail)
                      }
                    >
                      <Folder size={16} />
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
                      <Trash2 size={16} />
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
          {page === "Friends" && (
            <Friends
              key={state.activeAccount}
              state={state}
              social={social}
              selected={chatPeer}
              select={setChatPeer}
              notify={notify}
              accounts={() => setPage("Accounts")}
            />
          )}
          {page === "Servers" && (
            <Servers
              playerName={account?.name}
              versions={versions}
              latest={latest}
              run={run}
              fail={fail}
              busy={!!busy}
            />
          )}
          {page === "Rust Edition" && (
            <RustEdition
              state={state}
              profile={profile}
              run={run}
              busy={!!busy}
              open={open}
              navigate={() => setPage("Play")}
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
              navigate={setPage}
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
          {page !== "Friends" && (
            <footer className="footer">
              <span>AR CLIENT {state.version}</span>
              <div className="footer-links">
                <button onClick={() => request("folder.open").catch(fail)}>
                  Data folder
                </button>
                <button
                  onClick={() =>
                    open("https://github.com/KingAR1000/AR-Client")
                  }
                >
                  GitHub <ArrowUpRight size={12} />
                </button>
                <button onClick={() => open("https://client.kingar1000.xyz")}>
                  Website <ArrowUpRight size={12} />
                </button>
              </div>
              <button onClick={() => open("https://kingar1000.xyz")}>
                KINGAR1000 <ArrowUpRight size={12} />
              </button>
            </footer>
          )}
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
                  {progress.total > 1
                    ? `${Math.round((progress.current / progress.total) * 100)}%`
                    : ""}
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
        <div className="toasts" aria-live="polite">
          {notices.map((n) => (
            <div
              key={n.id}
              role={n.error ? "alert" : "status"}
              className={`toast ${n.error ? "error" : ""}`}
            >
              <span className="toast-icon">
                {n.error ? <TriangleAlert size={15} /> : <Check size={15} />}
              </span>
              <div className="grow">
                {n.title && <strong>{n.title}</strong>}
                <p>{n.text}</p>
              </div>
              {n.action && (
                <button
                  className="secondary small"
                  onClick={() => {
                    n.action?.run();
                    dismiss(n.id);
                  }}
                >
                  {n.action.label}
                </button>
              )}
              <button
                className="toast-close"
                aria-label="Dismiss notification"
                onClick={() => dismiss(n.id)}
              >
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
      </main>
      {palette && (
        <Palette commands={commands} close={() => setPalette(false)} />
      )}
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
  Friends: "See who's online and chat with verified Minecraft friends.",
  Servers: "Create and manage a server on this computer.",
  "Rust Edition":
    "Minecraft 26.3 powered by Horizon, an unofficial Rust implementation.",
  Play: "Select an installation and launch Minecraft.",
  Installations: "Manage game versions, modloaders, and instance settings.",
  Mods: "Browse and manage compatible mods.",
  "Resource Packs": "Browse, install, and reorder resource packs.",
  Modpacks: "Discover modpacks for your installation.",
  Skins: "Your skin library and owned capes.",
  Accounts: "Your Minecraft identities, securely stored.",
  Updates: "Launcher releases and compatible content updates.",
  Settings: "Accounts, updates, and the launcher itself.",
  "HUD Editor": "Position and customize your in-game widgets.",
};
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
