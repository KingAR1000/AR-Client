import {
  ArrowRight,
  Box,
  ChevronDown,
  Layers,
  Move,
  Play,
  Plus,
  UserRound,
} from "lucide-react";
import type { Account, Page, Profile } from "../api";
import World from "./World";

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
  return (
    <>
      <div className="home-heading">
        <div>
          <span className="eyebrow">YOUR LAUNCHER</span>
          <h1>{account ? `Hey, ${account.name}.` : "Let’s play."}</h1>
        </div>
        <button
          className="text-button"
          onClick={() => navigate("Installations")}
        >
          <Layers size={15} /> Manage installations <ArrowRight size={14} />
        </button>
      </div>
      <section className="game-stage" aria-label="Minecraft Java Edition">
        <World />
        <div className="stage-shade" />
        <div className="stage-topline">
          <span>
            <span className="status-dot" /> JAVA EDITION
          </span>
          <span>AR CLIENT</span>
        </div>
        <div className="stage-title">
          <h2>MINECRAFT</h2>
          <p>Java Edition</p>
          <span className="release-label">
            {latest
              ? `${latest} · Latest stable release`
              : "Official release channel"}
          </span>
        </div>
      </section>
      <section className="launch-dock" aria-label="Launch Minecraft">
        <div className="dock-profile">
          <div className="instance-mark">
            <Box size={23} strokeWidth={1.4} />
          </div>
          <div>
            <span className="field-caption">INSTALLATION</span>
            {profile ? (
              <div className="dock-select">
                <select
                  aria-label="Active installation"
                  value={profile.id}
                  onChange={(e) => select(e.target.value)}
                >
                  {profiles.map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} />
              </div>
            ) : (
              <button className="create-instance" onClick={create}>
                Create your first installation <Plus size={14} />
              </button>
            )}
            <small>
              {profile
                ? `${profile.version} · ${profile.loader.charAt(0).toUpperCase() + profile.loader.slice(1)}`
                : "Latest stable Minecraft by default"}
            </small>
          </div>
        </div>
        {profile && (
          <div className="dock-memory">
            <span className="field-caption">MEMORY</span>
            <strong>
              {profile.ram / 1024} <span>GB</span>
            </strong>
          </div>
        )}
        <button
          className="primary launch-button"
          disabled={!!busy || isRunning}
          onClick={
            profile ? (account ? launch : () => navigate("Accounts")) : create
          }
        >
          <Play size={18} fill="currentColor" />
          {busy ||
            (isRunning
              ? "Running"
              : profile
                ? account
                  ? "Play"
                  : "Sign in to play"
                : "Set up Minecraft")}
        </button>
      </section>
      {!account && (
        <div className="sign-in-nudge">
          <UserRound size={15} />
          <span>Connect your Microsoft account to play.</span>
          <button onClick={() => navigate("Accounts")}>
            Sign in <ArrowRight size={14} />
          </button>
        </div>
      )}
      <div className="home-section-heading">
        <h3>Customize</h3>
      </div>
      <div className="shortcut-grid">
        {(
          [
            ["Mods", Box, "Mods", "Browse compatible projects."],
            ["Skins", UserRound, "Skins", "Manage skins and owned capes."],
            ["HUD Editor", Move, "HUD editor", "Arrange your in-game widgets."],
          ] as const
        ).map(([page, Icon, title, subtitle]) => (
          <button
            className="shortcut"
            key={page}
            onClick={() => navigate(page)}
          >
            <Icon size={22} strokeWidth={1.4} />
            <h3>{title}</h3>
            <p>{subtitle}</p>
            <ArrowRight className="shortcut-arrow" size={17} />
          </button>
        ))}
      </div>
    </>
  );
}
