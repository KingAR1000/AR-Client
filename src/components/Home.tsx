import {
  ArrowRight,
  Box,
  ChevronDown,
  Download,
  Folder,
  Image,
  MessageSquare,
  Move,
  Play,
  Plus,
  Server,
  Settings2,
  Sparkles,
  UserRound,
  Wrench,
} from "lucide-react";
import type { Account, Page, Profile } from "../api";
import type { Social } from "../social";
import Head from "./Head";

const greeting = () => {
  const h = new Date().getHours();
  return h < 5
    ? "Late night"
    : h < 12
      ? "Good morning"
      : h < 18
        ? "Good afternoon"
        : "Good evening";
};

export default function HomeScreen({
  account,
  profiles,
  profile,
  latest,
  busy,
  running,
  social,
  select,
  navigate,
  create,
  launch,
  repair,
  openFolder,
  configure,
  chat,
}: {
  account?: Account;
  profiles: Profile[];
  profile?: Profile;
  latest: string;
  busy: string;
  running: string[];
  social: Social;
  select: (id: string) => void;
  navigate: (page: Page) => void;
  create: () => void;
  launch: (id: string) => unknown;
  repair: (id: string) => unknown;
  openFolder: () => unknown;
  configure: () => void;
  chat: (peer?: string) => void;
}) {
  const isRunning = !!profile && running.includes(profile.id);
  const outdated = !!profile && !!latest && profile.version !== latest;
  const primary = !profile
    ? { label: "Create installation", run: create, icon: <Plus size={20} /> }
    : !account
      ? {
          label: "Sign in to play",
          run: () => navigate("Accounts"),
          icon: <UserRound size={20} />,
        }
      : {
          label: isRunning ? "Running" : "Play",
          run: () => launch(profile.id),
          icon: <Play size={20} fill="currentColor" />,
        };
  const friends =
    social.snapshot?.peers.filter((p) => p.status === "accepted") || [];
  const shown = [...friends]
    .sort((a, b) => b.unread - a.unread || Number(b.online) - Number(a.online))
    .slice(0, 5);
  return (
    <div className="dashboard">
      <section className="hero">
        <div className="hero-art" aria-hidden />
        <div className="hero-body">
          <p className="hero-kicker">
            {account
              ? `${greeting()}, ${account.name}`
              : "Minecraft: Java Edition"}
          </p>
          <h1>{profile?.name || "Welcome to AR Client"}</h1>
          <div className="chips">
            {profile ? (
              <>
                <span className="chip">{profile.version}</span>
                <span className="chip">{profile.loader}</span>
                <span className="chip">{profile.ram / 1024} GB</span>
                {profile.preset && (
                  <span className="chip">{profile.preset}</span>
                )}
                {isRunning && <span className="chip live">● Running</span>}
              </>
            ) : (
              <span className="chip">Latest release {latest || "—"}</span>
            )}
          </div>
          <div className="hero-actions">
            <button
              className="play-button"
              disabled={!!busy || isRunning}
              onClick={primary.run}
            >
              {primary.icon}
              <span>{busy || primary.label}</span>
            </button>
            {profiles.length > 1 && profile && (
              <div className="select-pill">
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
                <ChevronDown size={14} />
              </div>
            )}
            {profile && (
              <>
                <button
                  className="ghost-button"
                  title="Configure"
                  onClick={configure}
                >
                  <Settings2 size={16} />
                </button>
                <button
                  className="ghost-button"
                  title="Open folder"
                  onClick={openFolder}
                >
                  <Folder size={16} />
                </button>
                <button
                  className="ghost-button"
                  title="Verify and repair game files"
                  disabled={!!busy}
                  onClick={() => repair(profile.id)}
                >
                  <Wrench size={16} />
                </button>
              </>
            )}
          </div>
          {outdated && (
            <button className="hero-note" onClick={configure}>
              <Sparkles size={14} /> Minecraft {latest} is available — switch
              this installation
              <ArrowRight size={13} />
            </button>
          )}
        </div>
      </section>
      <div className="dash-grid">
        <section className="card">
          <header>
            <h3>Installations</h3>
            <button className="text-button" onClick={create}>
              <Plus size={14} /> New
            </button>
          </header>
          {profiles.length ? (
            <div className="mini-list">
              {profiles.slice(0, 5).map((p) => (
                <div
                  key={p.id}
                  className={`mini-row ${p.id === profile?.id ? "current" : ""}`}
                >
                  <button className="mini-main" onClick={() => select(p.id)}>
                    <span className="block-icon">
                      <Box size={16} />
                    </span>
                    <span className="grow">
                      <strong>{p.name}</strong>
                      <small>
                        {running.includes(p.id)
                          ? "Running"
                          : `${p.version} · ${p.loader}`}
                      </small>
                    </span>
                  </button>
                  <button
                    className="icon-button play-mini"
                    title={`Launch ${p.name}`}
                    disabled={!!busy || !account || running.includes(p.id)}
                    onClick={() => launch(p.id)}
                  >
                    <Play size={14} fill="currentColor" />
                  </button>
                </div>
              ))}
              {profiles.length > 5 && (
                <button
                  className="text-button"
                  onClick={() => navigate("Installations")}
                >
                  View all {profiles.length} <ArrowRight size={13} />
                </button>
              )}
            </div>
          ) : (
            <p className="card-empty">
              Keep survival, modded and creative worlds separate with isolated
              installations.
            </p>
          )}
        </section>
        <section className="card">
          <header>
            <h3>
              Friends
              {social.status === "online" && (
                <span className="count">{social.online.length} online</span>
              )}
            </h3>
            <button className="text-button" onClick={() => chat()}>
              Open <ArrowRight size={13} />
            </button>
          </header>
          {!account ? (
            <p className="card-empty">Sign in to add friends and chat.</p>
          ) : !social.enabled ? (
            <div className="card-cta">
              <p className="card-empty">
                See who's online and chat without leaving the launcher.
              </p>
              <button
                className="secondary"
                onClick={() => {
                  social.connect();
                  chat();
                }}
              >
                <MessageSquare size={15} /> Connect Friends
              </button>
            </div>
          ) : shown.length ? (
            <div className="mini-list">
              {shown.map((p) => (
                <button
                  key={p.id}
                  className="mini-row mini-main"
                  onClick={() => chat(p.id)}
                >
                  <Head
                    name={p.name}
                    skin={p.skin}
                    size={30}
                    online={p.online}
                  />
                  <span className="grow">
                    <strong>{p.name}</strong>
                    <small className={p.online ? "live" : ""}>
                      {p.online ? p.activity || "Online" : "Offline"}
                    </small>
                  </span>
                  {p.unread > 0 && <b className="badge">{p.unread}</b>}
                </button>
              ))}
              {social.incoming > 0 && (
                <button className="text-button" onClick={() => chat()}>
                  {social.incoming} pending request
                  {social.incoming > 1 ? "s" : ""} <ArrowRight size={13} />
                </button>
              )}
            </div>
          ) : (
            <p className="card-empty">
              {social.status === "online"
                ? social.incoming
                  ? `You have ${social.incoming} friend request${social.incoming > 1 ? "s" : ""}.`
                  : "No friends yet — add someone by username."
                : social.status === "error"
                  ? social.error
                  : "Connecting…"}
            </p>
          )}
        </section>
        <section className="card">
          <header>
            <h3>Quick access</h3>
          </header>
          <div className="quick-grid">
            {(
              [
                ["Mods", Box, "Browse mods"],
                ["Resource Packs", Image, "Textures"],
                ["Skins", UserRound, "Your look"],
                ["HUD Editor", Move, "In-game HUD"],
                ["Servers", Server, "Host a server"],
                ["Updates", Download, "Patch notes"],
              ] as [Page, typeof Box, string][]
            ).map(([page, Icon, hint]) => (
              <button
                key={page}
                className="quick-tile"
                onClick={() => navigate(page)}
              >
                <Icon size={18} />
                <strong>{page === "Resource Packs" ? "Packs" : page}</strong>
                <small>{hint}</small>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
