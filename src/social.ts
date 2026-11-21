import { useCallback, useEffect, useRef, useState } from "react";
import {
  message,
  preview,
  request,
  type Notify,
  type SocialSnapshot,
} from "./api";

export type SocialStatus = "off" | "connecting" | "online" | "error";
export type Social = ReturnType<typeof useSocial>;
const call = <T>(action: string, args: object = {}) =>
  request<T>("social", { action, ...args });
const remembered = (account: string | null) =>
  !!account &&
  (preview || localStorage.getItem("ar.social." + account) === "on");

// One social connection for the whole launcher, so presence, unread counts and requests stay live on every page.
export function useSocial({
  account,
  activity,
  focused,
  viewing,
  notify,
  open,
}: {
  account: string | null;
  activity: string;
  focused: boolean;
  viewing: string;
  notify: Notify;
  open: (peer?: string) => void;
}) {
  const [enabled, setEnabled] = useState(() => remembered(account)),
    [snapshot, setSnapshot] = useState<SocialSnapshot | null>(null),
    [status, setStatus] = useState<SocialStatus>("off"),
    [error, setError] = useState("");
  const latest = useRef({ activity, focused, viewing, notify, open });
  latest.current = { activity, focused, viewing, notify, open };
  const previous = useRef<SocialSnapshot | null>(null);
  const wake = useRef<() => void>(() => {});
  useEffect(() => {
    setEnabled(remembered(account));
    setSnapshot(null);
    previous.current = null;
    setError("");
  }, [account]);
  const announce = useCallback((next: SocialSnapshot) => {
    const before = previous.current;
    previous.current = next;
    if (!before) return;
    const { viewing, focused, notify, open } = latest.current;
    for (const peer of next.peers) {
      const old = before.peers.find((p) => p.id === peer.id);
      if (
        peer.status === "accepted" &&
        peer.lastUnread > (old?.lastUnread || 0) &&
        !(focused && viewing === peer.id)
      )
        notify({
          title: peer.name,
          text:
            peer.unread > 1
              ? `${peer.unread} new messages`
              : "Sent you a message",
          action: { label: "Reply", run: () => open(peer.id) },
        });
      else if (peer.status === "pending" && peer.requester !== next.id && !old)
        notify({
          title: "Friend request",
          text: `${peer.name} wants to be friends`,
          action: { label: "View", run: () => open() },
        });
      else if (
        peer.status === "accepted" &&
        old?.status === "pending" &&
        old.requester === next.id
      )
        notify({ title: peer.name, text: "Accepted your friend request" });
    }
  }, []);
  const load = useCallback(async () => {
    const next = await call<SocialSnapshot>("state", {
      activity: latest.current.activity,
    });
    setSnapshot(next);
    setStatus("online");
    setError("");
    announce(next);
    return next;
  }, [announce]);
  useEffect(() => {
    if (!enabled || !account) {
      setStatus("off");
      return;
    }
    let active = true,
      timer = 0,
      failures = 0;
    const tick = async () => {
      window.clearTimeout(timer);
      if (!active) return;
      try {
        await load();
        failures = 0;
      } catch (e) {
        if (!active) return;
        failures++;
        setError(message(e));
        setStatus("error");
      }
      if (!active) return;
      const hidden = document.visibilityState !== "visible";
      const delay = failures
        ? Math.min(120_000, 10_000 * 2 ** failures)
        : hidden
          ? 60_000
          : latest.current.focused
            ? 8_000
            : 20_000;
      timer = window.setTimeout(tick, delay);
    };
    setStatus((s) => (s === "online" ? s : "connecting"));
    wake.current = tick;
    tick();
    const visible = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [enabled, account, load]);
  useEffect(() => {
    if (status === "online") wake.current();
  }, [activity, focused]);
  const connect = useCallback(() => {
    if (!account) return;
    localStorage.setItem("ar.social." + account, "on");
    setError("");
    setEnabled(true);
    wake.current();
  }, [account]);
  const forget = useCallback(() => {
    if (account) localStorage.removeItem("ar.social." + account);
    setEnabled(false);
    setSnapshot(null);
    previous.current = null;
  }, [account]);
  const act = useCallback(
    async <T = unknown>(action: string, args: object = {}) => {
      const result = await call<T>(action, args);
      if (action === "logout" || action === "delete-account") forget();
      else await load().catch(() => {});
      return result;
    },
    [load, forget],
  );
  const accepted = snapshot?.peers.filter((p) => p.status === "accepted") || [];
  return {
    enabled,
    status,
    error,
    snapshot,
    connect,
    act,
    call,
    refresh: load,
    online: accepted.filter((p) => p.online),
    unread: accepted.reduce(
      (n, p) => (focused && p.id === viewing ? n : n + p.unread),
      0,
    ),
    incoming:
      snapshot?.peers.filter(
        (p) => p.status === "pending" && p.requester !== snapshot.id,
      ).length || 0,
  };
}
