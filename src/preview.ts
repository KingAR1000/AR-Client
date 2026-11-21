// Sample data for the development-only interface preview. Imported dynamically under import.meta.env.DEV only.
import type { ChatMessage, LauncherState, Peer } from "./api";

const me = "5f0c3b1e2a4d4c8e9b7a6d5c4b3a2f10";
const now = () => Date.now();
const launcher: LauncherState = {
  profiles: [
    {
      id: "p1",
      name: "Survival",
      version: "26.3",
      loader: "fabric",
      loaderVersion: "0.20.1",
      ram: 6144,
      java: "",
      preset: "Balanced",
    },
    {
      id: "p2",
      name: "Creative builds",
      version: "26.2",
      loader: "vanilla",
      loaderVersion: "",
      ram: 4096,
      java: "",
      preset: "Performance",
    },
    {
      id: "p3",
      name: "Modded adventure",
      version: "1.21.11",
      loader: "neoforge",
      loaderVersion: "21.11.4",
      ram: 8192,
      java: "",
      preset: "Quality",
    },
  ],
  accounts: [{ id: me, name: "KingAR1000", capes: [] }],
  activeAccount: me,
  settings: { microsoftClientId: "", eulaAccepted: true },
  running: [],
  version: "0.1.0",
  curseforgeConfigured: false,
  companions: [{ minecraft: "26.3", minLoader: "0.20.1" }],
};
const peer = (id: string, name: string, extra: Partial<Peer>): Peer => ({
  id,
  name,
  skin: "",
  lastSeen: now() - 3 * 3600_000,
  activity: "",
  status: "accepted",
  requester: me,
  created: now() - 86400_000 * 9,
  online: false,
  unread: 0,
  lastUnread: 0,
  ...extra,
});
const peers: Peer[] = [
  peer("a1".padEnd(32, "0"), "Steve_Builds", {
    online: true,
    lastSeen: now(),
    activity: "Playing 26.3 · fabric",
  }),
  peer("b2".padEnd(32, "0"), "Alex", {
    online: true,
    lastSeen: now(),
    activity: "In the launcher",
    unread: 2,
    lastUnread: 3,
  }),
  peer("c3".padEnd(32, "0"), "Notch_Fan_42", {}),
  peer("d4".padEnd(32, "0"), "RedstoneRiley", {
    status: "pending",
    requester: "d4".padEnd(32, "0"),
  }),
];
let next = 10;
const chats = new Map<string, ChatMessage[]>([
  [
    peers[1].id,
    [
      {
        id: 1,
        sender: me,
        recipient: peers[1].id,
        body: "Are you on tonight?",
        created: now() - 26 * 3600_000,
      },
      {
        id: 2,
        sender: peers[1].id,
        recipient: me,
        body: "Yes! Just finished the nether hub 🔥",
        created: now() - 15 * 60_000,
      },
      {
        id: 3,
        sender: peers[1].id,
        recipient: me,
        body: "Want to join? I'm hosting on 26.3",
        created: now() - 14 * 60_000,
      },
    ],
  ],
]);
export async function respond(action: string, args: any): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 120));
  if (action === "state") return structuredClone(launcher);
  if (action === "versions")
    return {
      latest: { release: "26.3" },
      versions: ["26.3", "26.2", "26.1", "1.21.11"].map((id) => ({ id })),
    };
  if (
    action === "releases" ||
    action === "content.list" ||
    action === "server.list" ||
    action === "skin.list"
  )
    return [];
  if (action === "catalog") return { hits: [] };
  if (action !== "social")
    throw new Error(`“${action}” isn't available in the interface preview.`);
  const target = peers.find(
    (p) =>
      p.id === args.target ||
      p.name.toLowerCase() === String(args.target).toLowerCase(),
  );
  switch (args.action) {
    case "state":
      return {
        id: me,
        name: "KingAR1000",
        skin: "",
        now: now(),
        peers: structuredClone(peers),
        blocks: [],
      };
    case "messages": {
      const list = chats.get(args.target) || [];
      if (target) Object.assign(target, { unread: 0, lastUnread: 0 });
      const result = args.after
        ? list.filter((m) => m.id > args.after)
        : list.slice(-50);
      return {
        messages: result,
        seen: list.filter((m) => m.sender === me).at(-1)?.id || 0,
        more: false,
      };
    }
    case "send": {
      const message = {
        id: next++,
        sender: me,
        recipient: args.target,
        body: args.text,
        created: now(),
      };
      chats.set(args.target, [...(chats.get(args.target) || []), message]);
      setTimeout(() => {
        const reply = {
          id: next++,
          sender: args.target,
          recipient: me,
          body: "Sounds good — see you in game!",
          created: now(),
        };
        chats.set(args.target, [...(chats.get(args.target) || []), reply]);
        if (target)
          Object.assign(target, {
            unread: target.unread + 1,
            lastUnread: reply.id,
          });
      }, 4000);
      return message;
    }
    case "accept":
      if (target) target.status = "accepted";
      return { ok: true };
    case "request":
      if (!target)
        throw new Error("That player hasn't joined AR Client Friends yet.");
      return { ok: true, name: target.name };
    default:
      return { ok: true };
  }
}
