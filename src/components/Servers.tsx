import { useEffect, useState } from "react";
import { Folder, Play, Plus, Square, Terminal, RefreshCw } from "lucide-react";
import { request, type Run } from "../api";
import Empty from "./Empty";
type Server = {
  id: string;
  name: string;
  version: string;
  ram: number;
  port: number;
};
type Entry = {
  config: Server;
  running: boolean;
  stopping: boolean;
  address?: string;
};
export default function Servers({
  versions,
  latest,
  run,
  fail,
  busy,
  playerName,
}: {
  versions: string[];
  latest: string;
  run: Run;
  fail: (e: unknown) => void;
  busy: boolean;
  playerName?: string;
}) {
  const [servers, setServers] = useState<Entry[]>([]),
    [selected, setSelected] = useState(""),
    [logs, setLogs] = useState<string[]>([]),
    [command, setCommand] = useState(""),
    [creating, setCreating] = useState(false),
    [name, setName] = useState("Survival"),
    [version, setVersion] = useState(latest),
    [ram, setRam] = useState(4096),
    [port, setPort] = useState(25565);
  const entry = servers.find((s) => s.config.id === selected) || servers[0];
  async function refresh() {
    setServers(await request<Entry[]>("server.list"));
  }
  useEffect(() => {
    let active = true;
    let pending = false;
    const poll = async () => {
      if (!active || pending || document.visibilityState !== "visible") return;
      pending = true;
      try {
        const data = await request<Entry[]>("server.list");
        if (active) setServers(data);
      } catch (e) {
        if (active) fail(e);
      } finally {
        pending = false;
      }
    };
    poll();
    const t = setInterval(poll, 4000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);
  useEffect(() => {
    let active = true;
    let pending = false;
    setLogs([]);
    const poll = async () => {
      if (
        !entry ||
        !active ||
        pending ||
        document.visibilityState !== "visible"
      )
        return;
      pending = true;
      try {
        const lines = await request<string[]>("server.logs", {
          id: entry.config.id,
        });
        if (active) setLogs(lines);
      } catch (e) {
        if (active) fail(e);
      } finally {
        pending = false;
      }
    };
    poll();
    const t = setInterval(poll, 2000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [entry?.config.id]);
  return (
    <>
      <div className="callout">
        <Terminal size={19} />
        <span>
          Host on this computer. Friends need your LAN address, or a private VPN
          / port-forwarded address for internet access. AR Client does not open
          router ports or change your firewall.
        </span>
      </div>
      <div className="section-title">
        <h3>Your servers</h3>
        <button
          className="primary"
          disabled={busy}
          onClick={() => {
            setCreating(!creating);
            setVersion(latest);
          }}
        >
          <Plus size={16} />
          Create server
        </button>
      </div>
      {creating && (
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            run("Create server", async () => {
              const s = await request<Server>("server.create", {
                id: "",
                name,
                version,
                ram,
                port,
              });
              setSelected(s.id);
              setCreating(false);
              await refresh();
            });
          }}
        >
          <h3>New Java server</h3>
          <div className="form-grid">
            <label>
              Server name
              <input
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Minecraft version
              <select
                required
                value={version}
                onChange={(e) => setVersion(e.target.value)}
              >
                <option value="">Select release</option>
                {versions.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              Memory · {ram / 1024} GB
              <input
                type="range"
                min={1024}
                max={16384}
                step={512}
                value={ram}
                onChange={(e) => setRam(+e.target.value)}
              />
            </label>
            <label>
              Port
              <input
                type="number"
                required
                min={1024}
                max={65535}
                value={port}
                onChange={(e) => setPort(+e.target.value)}
              />
            </label>
          </div>
          <p className="muted">
            Online authentication and the whitelist are enabled. Add players
            with <code>whitelist add PlayerName</code> in the console before
            they join.
          </p>
          <div className="panel-footer">
            <button
              className="secondary"
              type="button"
              onClick={() => setCreating(false)}
            >
              Cancel
            </button>
            <button className="primary" disabled={busy}>
              Create server
            </button>
          </div>
        </form>
      )}
      {!servers.length ? (
        <section className="panel">
          <Empty
            title="No servers yet"
            text="Create an isolated Java server. World files remain on your computer."
          />
        </section>
      ) : (
        <div className="server-layout">
          <section className="panel server-list">
            {servers.map((s) => (
              <button
                className={`server-choice ${entry?.config.id === s.config.id ? "active" : ""}`}
                key={s.config.id}
                onClick={() => setSelected(s.config.id)}
              >
                <strong>{s.config.name}</strong>
                <small>
                  {s.config.version} · :{s.config.port}
                </small>
                <span>
                  {s.stopping
                    ? "Saving and stopping…"
                    : s.running
                      ? "Running"
                      : "Stopped"}
                </span>
              </button>
            ))}
          </section>
          {entry && (
            <section className="panel server-console">
              <div className="section-title">
                <div>
                  <h3>{entry.config.name}</h3>
                  <small>Connect locally: localhost:{entry.config.port}</small>
                </div>
                <div className="row">
                  {playerName && (
                    <button
                      className="secondary"
                      disabled={busy || !entry.running || entry.stopping}
                      onClick={() =>
                        run("Whitelist your account", () =>
                          request("server.command", {
                            id: entry.config.id,
                            command: `whitelist add ${playerName}`,
                          }),
                        )
                      }
                    >
                      Allow my account
                    </button>
                  )}
                  <button
                    className="icon-button"
                    title="Open server folder"
                    onClick={() =>
                      request("server.folder", { id: entry.config.id }).catch(
                        fail,
                      )
                    }
                  >
                    <Folder size={17} />
                  </button>
                  <button
                    className="secondary"
                    disabled={busy || entry.stopping}
                    onClick={() =>
                      run(
                        entry.running
                          ? "Stop server"
                          : "Install and start server",
                        async () => {
                          await request(
                            entry.running ? "server.stop" : "server.start",
                            { id: entry.config.id },
                          );
                          await refresh();
                        },
                      )
                    }
                  >
                    {entry.running ? <Square size={15} /> : <Play size={15} />}{" "}
                    {entry.stopping
                      ? "Stopping…"
                      : entry.running
                        ? "Stop"
                        : "Start"}
                  </button>
                </div>
              </div>
              {entry.address && (
                <div className="server-share">
                  <span>
                    LAN address: <code>{entry.address}</code>
                  </span>
                  <button
                    className="text-button"
                    onClick={() =>
                      navigator.clipboard.writeText(entry.address!).catch(fail)
                    }
                  >
                    Copy address
                  </button>
                </div>
              )}
              <pre className="console-output" aria-label="Server console">
                {logs.length
                  ? logs.join("\n")
                  : "Server output will appear after you start it."}
              </pre>
              <form
                className="console-input"
                onSubmit={(e) => {
                  e.preventDefault();
                  run("Send server command", async () => {
                    await request("server.command", {
                      id: entry.config.id,
                      command,
                    });
                    setCommand("");
                  });
                }}
              >
                <Terminal size={15} />
                <input
                  aria-label="Server command"
                  value={command}
                  maxLength={1024}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="whitelist add PlayerName"
                  disabled={!entry.running || entry.stopping}
                />
                <button
                  className="secondary"
                  disabled={
                    busy || !entry.running || entry.stopping || !command.trim()
                  }
                >
                  Send
                </button>
              </form>
              <button
                className="text-button"
                onClick={() => refresh().catch(fail)}
              >
                <RefreshCw size={13} />
                Refresh status
              </button>
            </section>
          )}
        </div>
      )}
    </>
  );
}
