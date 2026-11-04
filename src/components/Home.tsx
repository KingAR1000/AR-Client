import { ArrowUpRight, ChevronDown, Play, Plus } from "lucide-react";
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
}) {
  const isRunning = !!profile && running.includes(profile.id);
  const rows = [
    {
      title: "Installation",
      detail: profile
        ? `${profile.name} · ${profile.version} · ${profile.loader}`
        : "Choose a version and modloader to get started.",
      action: profile ? "Manage" : "Create installation",
      click: profile ? () => navigate("Installations") : create,
    },
    {
      title: "Playing as",
      detail: account
        ? account.name
        : "Connect the Microsoft account that owns Minecraft.",
      action: account ? "Switch account" : "Sign in",
      click: () => navigate("Accounts"),
    },
    {
      title: "Mods & resource packs",
      detail: "Make your installation your own.",
      action: "Browse mods",
      click: () => navigate("Mods"),
    },
    {
      title: "In-game HUD",
      detail: "Your widgets, keybinds and layout.",
      action: "Customize",
      click: () => navigate("HUD Editor"),
    },
  ];
  return (
    <section className="launch-home">
      <div className="launch-intro">
        <div className="release-meta">
          <span>MINECRAFT {profile?.version || latest || "JAVA EDITION"}</span>
          <span className="meta-dot">·</span>
          <span>
            {isRunning
              ? "RUNNING"
              : profile
                ? "JAVA EDITION"
                : "OFFICIAL RELEASES"}
          </span>
        </div>
        <h1>AR Client</h1>
        <p>
          Your Minecraft. Your setup.
          <br />
          Versions, mods and friends. All in one place.
        </p>
      </div>
      <div className="launch-controls">
        <div className="edition-toggle" aria-label="Game mode">
          <span className="selected">Client</span>
          <button onClick={() => navigate("Servers")}>Server</button>
        </div>
        <div className="launch-actions">
          {profile ? (
            <div className="installation-picker">
              <select
                aria-label="Active installation"
                value={profile.id}
                onChange={(e) => select(e.target.value)}
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.version}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} />
            </div>
          ) : (
            <button className="installation-picker" onClick={create}>
              <Plus size={14} /> Installation
            </button>
          )}
          <button
            className="primary launch-button"
            disabled={!!busy || isRunning}
            onClick={
              profile ? (account ? launch : () => navigate("Accounts")) : create
            }
          >
            <Play size={14} fill="currentColor" />
            {busy ||
              (isRunning
                ? "Running"
                : profile
                  ? account
                    ? "Play"
                    : "Sign in to play"
                  : "Set up Minecraft")}
          </button>
        </div>
      </div>
      <div className="launch-rows">
        {rows.map((row, i) => (
          <div className="launch-row" key={row.title}>
            <span className="row-index">0{i + 1}</span>
            <div>
              <h3>{row.title}</h3>
              <p>{row.detail}</p>
            </div>
            <button className="row-action" onClick={row.click}>
              {row.action}
              <ArrowUpRight size={13} />
            </button>
          </div>
        ))}
      </div>
      <div className="home-wordmark" aria-hidden="true">
        ar client
      </div>
    </section>
  );
}
