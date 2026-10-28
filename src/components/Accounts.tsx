import React, { useEffect, useRef, useState } from "react";

import {
  Home,
  Play,
  Layers,
  Box,
  Image,
  Package,
  UserRound,
  Users,
  Download,
  Settings,
  ChevronRight,
  Plus,
  ArrowUpRight,
  Search,
  Folder,
  Trash2,
  Copy,
  RefreshCw,
  X,
  Check,
  SlidersHorizontal,
  Move,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  LoaderCircle,
  ShieldCheck,
  Terminal,
  ChevronDown,
} from "lucide-react";

import {
  request,
  desktop,
  message,
  fileData,
  loaderChoices,
  type Profile,
  type LauncherState,
  type Content,
} from "../api";

import type { Page, Run, Widget } from "../api";
import Empty from "./Empty";
export default function Accounts({
  state,
  run,
  fail,
  refresh,
  open,
  settings,
}: {
  state: LauncherState;
  run: Run;
  fail: (e: unknown) => void;
  refresh: () => Promise<unknown>;
  open: (url: string) => void;
  settings: () => void;
}) {
  const [device, setDevice] = useState<{
      userCode: string;
      verificationUri: string;
      interval: number;
      expiresIn: number;
    } | null>(null),
    [polling, setPolling] = useState(false);
  useEffect(() => {
    if (!device) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let deadline = Date.now() + device.expiresIn * 1000;
    async function poll() {
      if (cancelled) return;
      if (Date.now() > deadline) {
        setDevice(null);
        fail("Sign-in expired. Please try again.");
        return;
      }
      try {
        const r = await request<{ pending: boolean }>("auth.poll");
        if (cancelled) return;
        if (!r.pending) {
          setDevice(null);
          await refresh();
          return;
        }
        timer = setTimeout(poll, (device?.interval || 5) * 1000 + 500);
      } catch (e) {
        if (!cancelled) {
          setDevice(null);
          fail(e);
        }
      }
    }
    timer = setTimeout(poll, device.interval * 1000 + 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [device]);
  return (
    <>
      <section className="panel">
        <div className="section-title">
          <h3>Microsoft accounts</h3>
          <button
            className="primary"
            disabled={polling || !!device}
            onClick={async () => {
              if (!state.settings.microsoftClientId) {
                settings();
                fail(
                  "Enter your own Microsoft application client ID before signing in. Setup instructions are in the README.",
                );
                return;
              }
              setPolling(true);
              try {
                setDevice(await request("auth.start"));
              } catch (e) {
                fail(e);
              } finally {
                setPolling(false);
              }
            }}
          >
            <Plus size={16} />
            Add account
          </button>
        </div>
        {device && (
          <div className="device-login">
            <span className="eyebrow">SIGN IN WITH MICROSOFT</span>
            <h2>{device.userCode}</h2>
            <p>
              Enter this code on Microsoft’s website. AR Client never asks for
              your password.
            </p>
            <div className="row">
              <button
                className="primary"
                onClick={() => open(device.verificationUri)}
              >
                Open Microsoft <ArrowUpRight size={16} />
              </button>
              <button
                className="secondary"
                onClick={() => {
                  setDevice(null);
                  request("auth.cancel").catch(fail);
                }}
              >
                Cancel
              </button>
            </div>
            <small>Waiting for authorization…</small>
          </div>
        )}
        {state.accounts.map((a) => (
          <div className="installation-row" key={a.id}>
            <div className="avatar">{a.name.slice(0, 2)}</div>
            <div className="grow">
              <h3>{a.name}</h3>
              <small>
                {a.id === state.activeAccount
                  ? "Active account"
                  : "Minecraft Java Edition"}
              </small>
            </div>
            {a.id !== state.activeAccount && (
              <button
                className="secondary"
                onClick={() =>
                  run("Switch account", () =>
                    request("account.select", { id: a.id }),
                  )
                }
              >
                Use account
              </button>
            )}
            <button
              className="icon-button danger"
              title="Remove saved account"
              onClick={() =>
                run("Remove account", () =>
                  request("account.remove", { id: a.id }),
                )
              }
            >
              <Trash2 size={17} />
            </button>
          </div>
        ))}
        {!state.accounts.length && !device && (
          <Empty
            title="Your identity. Your worlds."
            text="Connect a Microsoft account that owns Minecraft Java Edition to start playing."
          />
        )}
      </section>
      <div className="callout">
        <ShieldCheck size={22} />
        <div>
          <b>Credentials stay on your device.</b>
          <p>
            Refresh tokens are stored in the operating system credential vault.
            Account passwords never pass through AR Client.
          </p>
        </div>
      </div>
    </>
  );
}
