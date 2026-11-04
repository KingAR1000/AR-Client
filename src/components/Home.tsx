import { ChevronDown, Folder, Play, Settings2 } from "lucide-react";
import type { Account, Page, Profile } from "../api";
export default function HomeScreen({
  account,
  profiles,
  profile,
  latest,
  busy,
  running,
  select,
  navigate,
  create,
  launch,
  openFolder,
  configure,
}: {
  account?: Account;
  profiles: Profile[];
  profile?: Profile;
  latest: string;
  busy: string;
  running: string[];
  select: (id: string) => void;
  navigate: (page: Page) => void;
  create: () => void;
  launch: () => unknown;
  openFolder: () => unknown;
  configure: () => void;
}) {
  const isRunning = !!profile && running.includes(profile.id);
  const rows = [
    {
      title: "Instance",
      detail: profile
        ? `${profile.version} · ${profile.loader} · ${profile.ram / 1024} GB RAM`
        : "Create an isolated Minecraft installation.",
      action: profile ? "Edit…" : "Create…",
      click: configure,
    },
    {
      title: "Game files",
      detail: "Verify the installation and manage its contents.",
      action: "Manage…",
      click: () => navigate("Installations"),
    },
    {
      title: "Minecraft folder",
      detail: profile ? profile.name : "No installation selected.",
      action: "Open folder",
      click: openFolder,
    },
    {
      title: "Microsoft account",
      detail: account
        ? `Playing as ${account.name}`
        : "Sign in with the account that owns Minecraft: Java Edition.",
      action: account ? "Accounts…" : "Sign in with Microsoft",
      click: () => navigate("Accounts"),
    },
  ];
  return (
    <section className="night-home">
      <div className="night-hero">
        <p className="game-meta">
          Minecraft: Java Edition {profile?.version || latest}
          <span>
            {" "}
            ·{" "}
            {isRunning
              ? "Running"
              : profile
                ? profile.loader
                : "Installation required"}
          </span>
        </p>
        <h1>
          <img src="/app-icon.png" alt="" />
          {profile?.name || "AR Client"}
        </h1>
        <p className="game-caption">
          {profile
            ? "Your installation. Your way to play."
            : "Choose a Minecraft version to get started."}
        </p>
        <div className="game-actions">
          <button
            className="primary"
            disabled={!!busy || isRunning}
            onClick={
              profile ? (account ? launch : () => navigate("Accounts")) : create
            }
          >
            <Play size={19} />
            {busy ||
              (isRunning
                ? "Running"
                : profile
                  ? account
                    ? "Play"
                    : "Sign in"
                  : "Create installation")}
          </button>
          {profile && (
            <div className="game-version">
              <label htmlFor="game-installation">Installation</label>
              <select
                id="game-installation"
                aria-label="Active installation"
                value={profile.id}
                onChange={(e) => select(e.target.value)}
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.version} · {p.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </div>
          )}
          <button className="text-button" onClick={() => navigate("Mods")}>
            Mods
          </button>
          <button className="text-button" onClick={openFolder}>
            <Folder size={14} />
            Folder
          </button>
          <button className="friend-card" onClick={() => navigate("Friends")}>
            <span>Play together</span>
            <strong>Friends & messages</strong>
            <small>Open your friends list →</small>
          </button>
        </div>
      </div>
      <nav className="instance-tabs" aria-label="Instance navigation">
        <span aria-current="page">Overview</span>
        {(["Mods", "Resource Packs", "HUD Editor", "Servers"] as Page[]).map(
          (p) => (
            <button key={p} onClick={() => navigate(p)}>
              {p === "Resource Packs"
                ? "Packs"
                : p === "Servers"
                  ? "Multiplayer"
                  : p}
            </button>
          ),
        )}
      </nav>
      <div className="instance-overview">
        {rows.map((row) => (
          <div className="night-row" key={row.title}>
            <div>
              <h3>{row.title}</h3>
              <p>{row.detail}</p>
            </div>
            <button className="row-action" onClick={row.click}>
              {row.title === "Instance" && <Settings2 size={14} />} {row.action}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
