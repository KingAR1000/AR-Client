import { useEffect, useRef, useState } from "react";
import {
  Check,
  MessageSquare,
  RefreshCw,
  Send,
  Shield,
  UserPlus,
  X,
} from "lucide-react";
import { message, request, type LauncherState } from "../api";
import Empty from "./Empty";
type Peer = {
  id: string;
  name: string;
  lastSeen: number;
  status: "pending" | "accepted";
  requester: string;
};
type Snapshot = {
  id: string;
  peers: Peer[];
  blocks: { id: string; name: string }[];
};
type Chat = { id: number; sender: string; body: string; created: number };
const call = <T,>(action: string, args: object = {}) =>
  request<T>("social", { action, ...args });
export default function Friends({
  state,
  accounts,
}: {
  state: LauncherState;
  accounts: () => void;
}) {
  const [connected, setConnected] = useState(false),
    [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [tab, setTab] = useState("Friends"),
    [target, setTarget] = useState(""),
    [selected, setSelected] = useState(""),
    [messages, setMessages] = useState<Chat[]>([]),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const live = useRef(true);
  const chatTarget = useRef(selected);
  chatTarget.current = selected;
  const peer = snapshot?.peers.find(
    (p) => p.id === selected && p.status === "accepted",
  );
  async function load() {
    setSnapshot(await call<Snapshot>("state"));
  }
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  useEffect(() => {
    if (!connected) return;
    let active = true;
    let pending = false;
    const poll = async () => {
      if (!active || pending || document.visibilityState !== "visible") return;
      pending = true;
      try {
        const s = await call<Snapshot>("state");
        if (active) {
          setSnapshot(s);
          setError("");
        }
      } catch (e) {
        if (active) {
          setError(message(e));
          setConnected(false);
        }
      } finally {
        pending = false;
      }
    };
    poll();
    const timer = setInterval(poll, 8000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [connected, state.activeAccount]);
  async function chat(id: string, before?: number) {
    const result = await call<{ messages: Chat[] }>("messages", {
      target: id,
      before,
    });
    if (chatTarget.current !== id || !live.current) return;
    setMessages((current) => {
      const all = new Map(
        [...current, ...result.messages].map((m) => [m.id, m]),
      );
      return [...all.values()].sort((a, b) => a.id - b.id).slice(-500);
    });
  }
  useEffect(() => {
    setMessages([]);
    setText("");
    if (!connected || !peer) return;
    let active = true;
    let pending = false;
    const poll = async () => {
      if (!active || pending || document.visibilityState !== "visible") return;
      pending = true;
      try {
        await chat(peer.id);
      } catch (e) {
        if (active) setError(message(e));
      } finally {
        pending = false;
      }
    };
    poll();
    const timer = setInterval(poll, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [selected, connected, peer?.id]);
  async function act(action: string, args: object = {}) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await call(action, args);
      if (action === "delete-account" || action === "logout") {
        setConnected(false);
        setSnapshot(null);
        setSelected("");
        setMessages([]);
      } else {
        await load();
        if (action === "send" && peer) {
          setText("");
          await chat(peer.id);
        }
      }
    } catch (e) {
      setError(message(e));
    } finally {
      if (live.current) setBusy(false);
    }
  }
  if (!state.activeAccount)
    return (
      <section className="panel">
        <Empty
          title="Connect with your Minecraft account"
          text="Friends and chat use verified Minecraft identities."
          action="Open accounts"
          onClick={accounts}
        />
      </section>
    );
  return (
    <>
      {error && (
        <div className="callout error">
          <span>{error}</span>
        </div>
      )}
      {!connected ? (
        <section className="panel">
          <span className="eyebrow">AR CLIENT SOCIAL</span>
          <h2>Friends, across your worlds.</h2>
          <p className="muted">
            Send friend requests by Minecraft username and chat once both
            players accept. Players must connect to AR Client Friends before
            they can receive a request.
          </p>
          <div className="callout">
            <Shield size={20} />
            <span>
              Connecting shares your verified Minecraft ID and name with the AR
              Client social service. Messages are stored for up to 30 days and
              are not end-to-end encrypted. You can block players or delete your
              social data here.
            </span>
          </div>
          <button
            className="primary"
            disabled={busy}
            onClick={() => setConnected(true)}
          >
            <MessageSquare size={16} />
            {error ? "Retry connection" : "Connect to Friends"}
          </button>
        </section>
      ) : (
        <>
          <div className="catalog-toolbar">
            <div className="tabs">
              {["Friends", "Requests", "Blocked"].map((t) => (
                <button
                  key={t}
                  className={tab === t ? "active" : ""}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            <button
              className="text-button"
              onClick={() => load().catch((e) => setError(message(e)))}
            >
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>
          <form
            className="search-bar"
            onSubmit={(e) => {
              e.preventDefault();
              act("request", { target }).then(() => setTarget(""));
            }}
          >
            <UserPlus size={18} />
            <input
              aria-label="Friend Minecraft username"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              required
              minLength={1}
              maxLength={16}
              pattern="[A-Za-z0-9_]+"
              placeholder="Exact Minecraft username"
            />
            <button className="secondary" disabled={busy}>
              Send request
            </button>
          </form>
          <div className="friends-layout">
            <section className="panel friends-list">
              {!snapshot ? (
                <div className="loading">Connecting…</div>
              ) : (
                <>
                  {tab === "Blocked"
                    ? snapshot.blocks.map((p) => (
                        <div className="friend-row" key={p.id}>
                          <span className="grow">{p.name}</span>
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() => act("unblock", { target: p.id })}
                          >
                            Unblock
                          </button>
                        </div>
                      ))
                    : snapshot.peers
                        .filter(
                          (p) =>
                            p.status ===
                            (tab === "Friends" ? "accepted" : "pending"),
                        )
                        .map((p) => (
                          <div
                            key={p.id}
                            className={`friend-row ${selected === p.id ? "selected" : ""}`}
                          >
                            <button
                              className="friend-identity grow"
                              onClick={() => {
                                if (p.status === "accepted") setSelected(p.id);
                              }}
                            >
                              <span className="avatar">
                                {p.name.slice(0, 2)}
                              </span>
                              <span>
                                {p.name}
                                <small>
                                  {p.status === "accepted"
                                    ? Date.now() - p.lastSeen < 25000
                                      ? "Online in Friends"
                                      : "Offline"
                                    : p.requester === snapshot.id
                                      ? "Request sent"
                                      : "Incoming request"}
                                </small>
                              </span>
                            </button>
                            {p.status === "pending" &&
                              p.requester !== snapshot.id && (
                                <button
                                  className="icon-button"
                                  title="Accept request"
                                  disabled={busy}
                                  onClick={() =>
                                    act("accept", { target: p.id })
                                  }
                                >
                                  <Check size={17} />
                                </button>
                              )}
                            <button
                              className="icon-button"
                              title={
                                p.status === "accepted"
                                  ? "Remove friend"
                                  : "Cancel or decline request"
                              }
                              disabled={busy}
                              onClick={() => act("remove", { target: p.id })}
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ))}
                  {tab === "Friends" &&
                    !snapshot.peers.some((p) => p.status === "accepted") && (
                      <Empty
                        title="No friends yet"
                        text="Send a request using their exact Minecraft username."
                      />
                    )}
                  {tab === "Requests" &&
                    !snapshot.peers.some((p) => p.status === "pending") && (
                      <p className="muted">No pending requests.</p>
                    )}
                  {tab === "Blocked" && !snapshot.blocks.length && (
                    <p className="muted">No blocked players.</p>
                  )}
                </>
              )}
            </section>
            <section className="panel chat-panel">
              {peer ? (
                <>
                  <div className="section-title">
                    <h3>{peer.name}</h3>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => act("block", { target: peer.id })}
                    >
                      <Shield size={13} />
                      Block player
                    </button>
                  </div>
                  <div
                    className="chat-history"
                    role="log"
                    aria-label={`Messages with ${peer.name}`}
                  >
                    {messages.length >= 50 && messages.length < 500 && (
                      <button
                        className="text-button"
                        onClick={() =>
                          chat(peer.id, messages[0].id).catch((e) =>
                            setError(message(e)),
                          )
                        }
                      >
                        Load older messages
                      </button>
                    )}
                    {!messages.length && (
                      <p className="muted">No messages yet. Say hello.</p>
                    )}
                    {messages.map((m) => (
                      <div
                        className={`chat-message ${m.sender === snapshot?.id ? "own" : ""}`}
                        key={m.id}
                      >
                        <p>{m.body}</p>
                        <time>
                          {new Date(m.created).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </div>
                    ))}
                  </div>
                  <form
                    className="chat-compose"
                    onSubmit={(e) => {
                      e.preventDefault();
                      act("send", { target: peer.id, text });
                    }}
                  >
                    <input
                      aria-label="Chat message"
                      disabled={busy}
                      value={text}
                      maxLength={2000}
                      onChange={(e) => setText(e.target.value)}
                      placeholder={`Message ${peer.name}`}
                    />
                    <button
                      className="primary"
                      disabled={busy || !text.trim()}
                      aria-label="Send message"
                    >
                      <Send size={16} />
                    </button>
                  </form>
                  <small>
                    Messages expire after 30 days. Keep personal information
                    private.
                  </small>
                </>
              ) : (
                <Empty
                  title="Choose a friend"
                  text="Accepted friends can exchange private messages here."
                />
              )}
            </section>
          </div>
          <div className="social-footer">
            <button
              className="text-button"
              disabled={busy}
              onClick={() => act("logout")}
            >
              Disconnect Friends
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                if (
                  confirm(
                    "Delete your AR Client social profile, friendships, and all messages you sent or received? Your Minecraft account is unaffected.",
                  )
                )
                  act("delete-account");
              }}
            >
              Delete my social data
            </button>
          </div>
        </>
      )}
    </>
  );
}
