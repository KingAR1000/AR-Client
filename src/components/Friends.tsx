import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CheckCheck,
  Clock,
  Lock,
  LogOut,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  Shield,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  message,
  type ChatMessage,
  type LauncherState,
  type Notify,
  type Peer,
} from "../api";
import type { Social } from "../social";
import Empty from "./Empty";
import Head from "./Head";

type Tab = "Friends" | "Requests" | "Blocked";
const day = (t: number) =>
  new Date(t).toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
const clock = (t: number) =>
  new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
function ago(now: number, then: number) {
  const minutes = Math.round((now - then) / 60000);
  if (!then) return "Offline";
  if (minutes < 60) return `Last seen ${Math.max(1, minutes)}m ago`;
  if (minutes < 1440) return `Last seen ${Math.round(minutes / 60)}h ago`;
  return `Last seen ${Math.round(minutes / 1440)}d ago`;
}
function describe(peer: Peer, self: string, now: number) {
  if (peer.status === "pending")
    return peer.requester === self ? "Request sent" : "Wants to be friends";
  if (peer.online) return peer.activity || "Online";
  return ago(now, peer.lastSeen);
}

export default function Friends({
  state,
  social,
  selected,
  select,
  accounts,
  notify,
}: {
  state: LauncherState;
  social: Social;
  selected: string;
  select: (id: string) => void;
  accounts: () => void;
  notify: Notify;
}) {
  const [tab, setTab] = useState<Tab>("Friends"),
    [target, setTarget] = useState(""),
    [filter, setFilter] = useState(""),
    [busy, setBusy] = useState(false);
  const { snapshot } = social;
  const account = state.accounts.find((a) => a.id === state.activeAccount);
  const peers = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return (snapshot?.peers || [])
      .filter(
        (p) =>
          p.status === (tab === "Friends" ? "accepted" : "pending") &&
          p.name.toLowerCase().includes(term),
      )
      .sort(
        (a, b) =>
          b.unread - a.unread ||
          Number(b.online) - Number(a.online) ||
          a.name.localeCompare(b.name),
      );
  }, [snapshot, tab, filter]);
  const peer = snapshot?.peers.find(
    (p) => p.id === selected && p.status === "accepted",
  );
  async function act(action: string, args: object = {}, done?: string) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await social.act<{ accepted?: boolean; name?: string }>(
        action,
        args,
      );
      if (done) notify({ text: done });
      return result;
    } catch (e) {
      notify({ text: message(e), error: true });
    } finally {
      setBusy(false);
    }
  }
  if (!state.activeAccount)
    return (
      <section className="panel">
        <Empty
          icon={<Users size={26} />}
          title="Sign in to use Friends"
          text="Friends and chat use your verified Minecraft identity. Add the Microsoft account that owns Minecraft: Java Edition."
          action="Open accounts"
          onClick={accounts}
        />
      </section>
    );
  if (!social.enabled || (!snapshot && social.status === "error"))
    return (
      <section className="panel social-intro">
        <div className="social-intro-art" aria-hidden>
          <Head name="A" size={54} skin={account?.skin} />
          <span className="dots" />
          <span className="head ghost" />
        </div>
        <span className="eyebrow">AR CLIENT SOCIAL</span>
        <h2>Play together, stay in touch.</h2>
        <p className="muted">
          Add friends by Minecraft username, see who's online and what they're
          playing, and chat privately — right from the launcher.
        </p>
        <ul className="feature-list">
          <li>
            <Shield size={16} /> Identities are verified with Mojang-signed
            certificates. Your Minecraft token never leaves this computer.
          </li>
          <li>
            <Clock size={16} /> Messages are kept for 30 days and are not
            end-to-end encrypted.
          </li>
          <li>
            <Lock size={16} /> Block players or delete all your social data at
            any time.
          </li>
        </ul>
        {social.error && (
          <div className="callout error">
            <span>{social.error}</span>
          </div>
        )}
        <button
          className="primary"
          disabled={social.status === "connecting"}
          onClick={social.connect}
        >
          <MessageSquare size={16} />
          {social.status === "connecting"
            ? "Connecting…"
            : social.error
              ? "Try again"
              : `Connect as ${account?.name || "player"}`}
        </button>
      </section>
    );
  const counts = {
    Friends: snapshot?.peers.filter((p) => p.status === "accepted").length || 0,
    Requests: social.incoming,
    Blocked: snapshot?.blocks.length || 0,
  };
  return (
    <div className="friends-layout">
      <section className="panel friends-sidebar">
        <div className="me">
          <Head
            name={snapshot?.name || account?.name || "?"}
            skin={snapshot?.skin || account?.skin}
            size={38}
            online={social.status === "online"}
          />
          <div className="grow">
            <strong>{snapshot?.name || account?.name}</strong>
            <small>
              {social.status === "online"
                ? `${social.online.length} of ${counts.Friends} friends online`
                : social.status === "error"
                  ? "Reconnecting…"
                  : "Connecting…"}
            </small>
          </div>
          <button
            className="icon-button"
            title="Refresh"
            onClick={() =>
              social
                .refresh()
                .catch((e) => notify({ text: message(e), error: true }))
            }
          >
            <RefreshCw size={15} />
          </button>
        </div>
        {social.status === "error" && social.error && (
          <div className="callout error compact">{social.error}</div>
        )}
        <form
          className="add-friend"
          onSubmit={async (e) => {
            e.preventDefault();
            const name = target.trim();
            const result = await act("request", { target: name });
            if (!result) return;
            setTarget("");
            notify({
              text: result.accepted
                ? `You and ${result.name || name} are now friends`
                : `Friend request sent to ${result.name || name}`,
            });
          }}
        >
          <UserPlus size={16} />
          <input
            aria-label="Add friend by Minecraft username"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            required
            maxLength={16}
            pattern="[A-Za-z0-9_]{1,16}"
            placeholder="Add friend by username"
          />
          <button className="primary small" disabled={busy || !target.trim()}>
            Add
          </button>
        </form>
        <div className="segmented" role="tablist">
          {(["Friends", "Requests", "Blocked"] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              className={tab === t ? "active" : ""}
              onClick={() => setTab(t)}
            >
              {t}
              {t === "Requests" && counts.Requests > 0 ? (
                <b className="badge">{counts.Requests}</b>
              ) : (
                counts[t] > 0 && <span className="count">{counts[t]}</span>
              )}
            </button>
          ))}
        </div>
        {tab !== "Blocked" && counts[tab] > 6 && (
          <label className="filter">
            <Search size={14} />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search"
              aria-label="Search friends"
            />
          </label>
        )}
        <div className="friend-list">
          {!snapshot ? (
            <div className="loading">Connecting…</div>
          ) : tab === "Blocked" ? (
            snapshot.blocks.length ? (
              snapshot.blocks.map((p) => (
                <div className="friend-row" key={p.id}>
                  <Head name={p.name} skin={p.skin} size={32} />
                  <span className="grow">{p.name}</span>
                  <button
                    className="secondary small"
                    disabled={busy}
                    onClick={() =>
                      act("unblock", { target: p.id }, `Unblocked ${p.name}`)
                    }
                  >
                    Unblock
                  </button>
                </div>
              ))
            ) : (
              <p className="list-empty">You haven't blocked anyone.</p>
            )
          ) : peers.length ? (
            peers.map((p) => {
              const incoming =
                p.status === "pending" && p.requester !== snapshot.id;
              return (
                <div
                  key={p.id}
                  className={`friend-row ${selected === p.id ? "selected" : ""} ${p.status}`}
                >
                  <button
                    className="friend-identity"
                    disabled={p.status !== "accepted"}
                    onClick={() => select(p.id)}
                  >
                    <Head
                      name={p.name}
                      skin={p.skin}
                      size={34}
                      online={p.status === "accepted" ? p.online : undefined}
                    />
                    <span>
                      <strong>{p.name}</strong>
                      <small className={p.online ? "live" : ""}>
                        {describe(p, snapshot.id, snapshot.now)}
                      </small>
                    </span>
                  </button>
                  {p.unread > 0 && p.id !== selected && (
                    <b className="badge">{p.unread}</b>
                  )}
                  {incoming && (
                    <button
                      className="icon-button accept"
                      title={`Accept ${p.name}`}
                      disabled={busy}
                      onClick={() =>
                        act(
                          "accept",
                          { target: p.id },
                          `You and ${p.name} are now friends`,
                        )
                      }
                    >
                      <Check size={16} />
                    </button>
                  )}
                  {p.status === "pending" && (
                    <button
                      className="icon-button"
                      title={incoming ? "Decline" : "Cancel request"}
                      disabled={busy}
                      onClick={() => act("remove", { target: p.id })}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            <p className="list-empty">
              {filter
                ? "No matches."
                : tab === "Friends"
                  ? "No friends yet. Add someone by their exact Minecraft username — they need to connect to AR Client Friends once."
                  : "No pending requests."}
            </p>
          )}
        </div>
        <div className="social-footer">
          <button
            className="text-button"
            disabled={busy}
            onClick={() => act("logout")}
          >
            <LogOut size={13} /> Disconnect
          </button>
          <button
            className="text-button danger"
            disabled={busy}
            onClick={() => {
              if (
                confirm(
                  "Delete your AR Client social profile, friendships, and all messages you sent or received? Your Minecraft account is unaffected.",
                )
              )
                act("delete-account", {}, "Your social data was deleted");
            }}
          >
            <Trash2 size={13} /> Delete my data
          </button>
        </div>
      </section>
      {peer && snapshot ? (
        <Conversation
          key={peer.id}
          peer={peer}
          self={snapshot.id}
          social={social}
          notify={notify}
          busy={busy}
          act={act}
          close={() => select("")}
        />
      ) : (
        <section className="panel chat-panel chat-empty">
          <Empty
            icon={<MessageSquare size={26} />}
            title={
              counts.Friends ? "Pick a conversation" : "Your chats live here"
            }
            text={
              counts.Friends
                ? "Choose a friend to start chatting. You'll get a notification when new messages arrive anywhere in the launcher."
                : "Once a friend accepts your request you can message them here."
            }
          />
        </section>
      )}
    </div>
  );
}

function Conversation({
  peer,
  self,
  social,
  notify,
  busy,
  act,
  close,
}: {
  peer: Peer;
  self: string;
  social: Social;
  notify: Notify;
  busy: boolean;
  act: (action: string, args?: object, done?: string) => Promise<unknown>;
  close: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]),
    [loaded, setLoaded] = useState(false),
    [more, setMore] = useState(false),
    [seen, setSeen] = useState(0),
    [text, setText] = useState(""),
    [sending, setSending] = useState(false);
  const history = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const last = useRef(0);
  const merge = (incoming: ChatMessage[]) =>
    setMessages((current) => {
      const all = new Map([...current, ...incoming].map((m) => [m.id, m]));
      const sorted = [...all.values()].sort((a, b) => a.id - b.id).slice(-500);
      last.current = sorted.at(-1)?.id || 0;
      return sorted;
    });
  useEffect(() => {
    let active = true,
      timer = 0,
      pending = false;
    const poll = async () => {
      window.clearTimeout(timer);
      if (!active || pending) return;
      pending = true;
      try {
        const result = await social.call<{
          messages: ChatMessage[];
          seen: number;
          more: boolean;
        }>(
          "messages",
          last.current
            ? { target: peer.id, after: last.current }
            : { target: peer.id },
        );
        if (!active) return;
        if (!last.current) setMore(result.more);
        merge(result.messages);
        setSeen(result.seen);
        setLoaded(true);
      } catch (e) {
        if (active) notify({ text: message(e), error: true });
      } finally {
        pending = false;
        if (active)
          timer = window.setTimeout(
            poll,
            document.visibilityState === "visible" ? 3000 : 30000,
          );
      }
    };
    poll();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [peer.id]);
  useLayoutEffect(() => {
    const el = history.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);
  async function older() {
    const el = history.current;
    const height = el?.scrollHeight || 0;
    try {
      const result = await social.call<{
        messages: ChatMessage[];
        more: boolean;
      }>("messages", { target: peer.id, before: messages[0]?.id });
      stick.current = false;
      merge(result.messages);
      setMore(result.more);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - height;
      });
    } catch (e) {
      notify({ text: message(e), error: true });
    }
  }
  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const sent = await social.call<ChatMessage>("send", {
        target: peer.id,
        text: body,
      });
      stick.current = true;
      merge([sent]);
      setText("");
    } catch (e) {
      notify({ text: message(e), error: true });
    } finally {
      setSending(false);
    }
  }
  const lastOwn = [...messages].reverse().find((m) => m.sender === self);
  return (
    <section className="panel chat-panel">
      <header className="chat-header">
        <Head
          name={peer.name}
          skin={peer.skin}
          size={40}
          online={peer.online}
        />
        <div className="grow">
          <h3>{peer.name}</h3>
          <small className={peer.online ? "live" : ""}>
            {peer.online ? peer.activity || "Online" : "Offline"}
          </small>
        </div>
        <button
          className="icon-button"
          title="Remove friend"
          disabled={busy}
          onClick={() => {
            if (confirm(`Remove ${peer.name} from your friends?`))
              act("remove", { target: peer.id }, `Removed ${peer.name}`).then(
                close,
              );
          }}
        >
          <UserMinus size={16} />
        </button>
        <button
          className="icon-button danger"
          title="Block player"
          disabled={busy}
          onClick={() => {
            if (
              confirm(
                `Block ${peer.name}? This removes the friendship and stops all messages in both directions.`,
              )
            )
              act("block", { target: peer.id }, `Blocked ${peer.name}`).then(
                close,
              );
          }}
        >
          <Shield size={16} />
        </button>
      </header>
      <div
        className="chat-history"
        ref={history}
        role="log"
        aria-label={`Messages with ${peer.name}`}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
      >
        {more && (
          <button className="text-button load-older" onClick={older}>
            Load older messages
          </button>
        )}
        {!loaded ? (
          <div className="loading">Loading messages…</div>
        ) : !messages.length ? (
          <div className="chat-start">
            <Head name={peer.name} skin={peer.skin} size={64} />
            <h3>This is the start of your chat with {peer.name}</h3>
            <small>Say hello! Messages disappear after 30 days.</small>
          </div>
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const newDay = !prev || day(prev.created) !== day(m.created);
            const grouped =
              !newDay &&
              prev.sender === m.sender &&
              m.created - prev.created < 5 * 60000;
            const own = m.sender === self;
            return (
              <div key={m.id}>
                {newDay && (
                  <div className="day-divider">
                    <span>{day(m.created)}</span>
                  </div>
                )}
                <div
                  className={`chat-message ${own ? "own" : ""} ${grouped ? "grouped" : ""}`}
                >
                  <p>{m.body}</p>
                  <time dateTime={new Date(m.created).toISOString()}>
                    {clock(m.created)}
                  </time>
                </div>
                {own && m.id === lastOwn?.id && seen >= m.id && (
                  <div className="seen">
                    <CheckCheck size={12} /> Seen
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      <form
        className="chat-compose"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          aria-label="Chat message"
          rows={1}
          value={text}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={`Message ${peer.name}`}
        />
        {text.length > 1800 && (
          <small className="counter">{2000 - text.length}</small>
        )}
        <button
          className="primary icon"
          disabled={sending || !text.trim()}
          aria-label="Send message"
        >
          <Send size={16} />
        </button>
      </form>
    </section>
  );
}
