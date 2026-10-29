import { useEffect, useRef, useState } from "react";

import { Check, Move } from "lucide-react";

import { request, type Profile } from "../api";

import type { Run, Widget } from "../api";
import Empty from "./Empty";
const widgetNames = [
  "FPS",
  "CPS",
  "Keystrokes",
  "Coordinates",
  "Ping",
  "Armor",
  "Potions",
  "Clock",
];
export default function Hud({
  profile,
  companions,
  run,
  fail,
}: {
  profile?: Profile;
  companions: { minecraft: string; minLoader: string }[];
  run: Run;
  fail: (e: unknown) => void;
}) {
  const [widgets, setWidgets] = useState<Widget[]>([]),
    [selected, setSelected] = useState("FPS"),
    [tab, setTab] = useState("Widgets"),
    [toggleSprint, setToggleSprint] = useState(false),
    [extras, setExtras] = useState({
      customCrosshair: false,
      hideScoreboard: false,
      crosshairSize: 4,
      crosshairGap: 2,
      crosshairColor: "#ffffff",
      chatOpacity: 1,
    });
  const board = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (profile)
      request<{
        widgets: Widget[];
        toggleSprint: boolean;
        customCrosshair?: boolean;
        hideScoreboard?: boolean;
        crosshairSize?: number;
        crosshairGap?: number;
        crosshairColor?: string;
        chatOpacity?: number;
      }>("hud.load", { profile: profile.id })
        .then((v) => {
          setWidgets(
            v.widgets.length
              ? v.widgets
              : widgetNames.map((id, i) => ({
                  id,
                  x: 0.03,
                  y: 0.05 + i * 0.09,
                  scale: 1,
                  opacity: 0.85,
                  color: "#ffffff",
                  enabled: true,
                })),
          );
          setToggleSprint(v.toggleSprint);
          setExtras({
            customCrosshair: v.customCrosshair ?? false,
            hideScoreboard: v.hideScoreboard ?? false,
            crosshairSize: v.crosshairSize ?? 4,
            crosshairGap: v.crosshairGap ?? 2,
            crosshairColor: v.crosshairColor ?? "#ffffff",
            chatOpacity: v.chatOpacity ?? 1,
          });
        })
        .catch(fail);
  }, [profile?.id]);
  const active = widgets.find((w) => w.id === selected);
  function change(update: Partial<Widget>) {
    setWidgets((ws) =>
      ws.map((w) => (w.id === selected ? { ...w, ...update } : w)),
    );
  }
  if (!profile)
    return (
      <section className="panel">
        <Empty
          title="Choose an installation first"
          text="HUD layouts are saved separately for each installation."
        />
      </section>
    );
  if (profile.loader !== "fabric")
    return (
      <section className="panel">
        <Empty
          title="AR HUD requires Fabric"
          text="Choose Fabric for AR's in-game HUD. This installation can still launch with its current modloader."
        />
      </section>
    );
  if (!companions.some((build) => build.minecraft === profile.version))
    return (
      <section className="panel">
        <Empty
          title="AR HUD is not available for this game version"
          text="This installation can launch normally. Its game version does not yet have a compatible bundled AR HUD. Use a supported Fabric installation, or update AR Client for a newly released Minecraft version."
        />
      </section>
    );
  return (
    <>
      <div className="callout">
        <Move size={20} />
        <span>
          Drag widgets to position them. This is a layout preview; changes apply
          on your next game launch.
        </span>
      </div>
      <div className="hud-layout">
        <div className="hud-board" ref={board}>
          <span className="hud-label">HUD POSITION PREVIEW</span>
          <div className="crosshair">+</div>
          {widgets
            .filter((w) => w.enabled)
            .map((w) => (
              <button
                className={`hud-widget ${selected === w.id ? "selected" : ""}`}
                key={w.id}
                style={{
                  left: `${w.x * 100}%`,
                  top: `${w.y * 100}%`,
                  opacity: w.opacity,
                  color: w.color,
                  transform: `scale(${w.scale})`,
                }}
                onFocus={() => setSelected(w.id)}
                onKeyDown={(e) => {
                  const directions: Record<string, [number, number]> = {
                    ArrowLeft: [-0.01, 0],
                    ArrowRight: [0.01, 0],
                    ArrowUp: [0, -0.01],
                    ArrowDown: [0, 0.01],
                  };
                  const delta = directions[e.key];
                  if (!delta) return;
                  e.preventDefault();
                  change({
                    x: Math.min(0.85, Math.max(0, w.x + delta[0])),
                    y: Math.min(0.92, Math.max(0, w.y + delta[1])),
                  });
                }}
                onPointerDown={(e) => {
                  setSelected(w.id);
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (
                    !e.currentTarget.hasPointerCapture(e.pointerId) ||
                    !board.current
                  )
                    return;
                  const rect = board.current.getBoundingClientRect();
                  setWidgets((ws) =>
                    ws.map((x) =>
                      x.id === w.id
                        ? {
                            ...x,
                            x: Math.min(
                              0.85,
                              Math.max(0, (e.clientX - rect.left) / rect.width),
                            ),
                            y: Math.min(
                              0.92,
                              Math.max(0, (e.clientY - rect.top) / rect.height),
                            ),
                          }
                        : x,
                    ),
                  );
                }}
                onPointerUp={(e) =>
                  e.currentTarget.releasePointerCapture(e.pointerId)
                }
              >
                {w.id}
              </button>
            ))}
        </div>
        <section className="panel hud-controls">
          <div className="tabs" aria-label="HUD controls">
            {["Widgets", "Gameplay"].map((name) => (
              <button
                key={name}
                className={tab === name ? "active" : ""}
                onClick={() => setTab(name)}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="hud-control-body">
            {tab === "Widgets" && (
              <>
                <label>
                  Widget
                  <select
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                  >
                    {widgets.map((w) => (
                      <option key={w.id}>{w.id}</option>
                    ))}
                  </select>
                </label>
                {active && (
                  <>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={active.enabled}
                        onChange={(e) => change({ enabled: e.target.checked })}
                      />
                      Visible
                    </label>
                    <label>
                      Scale · {active.scale.toFixed(1)}×
                      <input
                        type="range"
                        min="0.5"
                        max="2"
                        step="0.1"
                        value={active.scale}
                        onChange={(e) => change({ scale: +e.target.value })}
                      />
                    </label>
                    <label>
                      Opacity
                      <input
                        type="range"
                        min="0.2"
                        max="1"
                        step="0.05"
                        value={active.opacity}
                        onChange={(e) => change({ opacity: +e.target.value })}
                      />
                    </label>
                    <label>
                      Color
                      <input
                        type="color"
                        value={active.color}
                        onChange={(e) => change({ color: e.target.value })}
                      />
                    </label>
                  </>
                )}
              </>
            )}
            {tab === "Gameplay" && (
              <>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={toggleSprint}
                    onChange={(e) => setToggleSprint(e.target.checked)}
                  />
                  Toggle sprint on by default
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={extras.customCrosshair}
                    onChange={(e) =>
                      setExtras({
                        ...extras,
                        customCrosshair: e.target.checked,
                      })
                    }
                  />
                  Custom crosshair
                </label>
                <label>
                  Crosshair size
                  <input
                    type="range"
                    min="2"
                    max="16"
                    value={extras.crosshairSize}
                    onChange={(e) =>
                      setExtras({ ...extras, crosshairSize: +e.target.value })
                    }
                  />
                </label>
                <label>
                  Crosshair gap
                  <input
                    type="range"
                    min="0"
                    max="10"
                    value={extras.crosshairGap}
                    onChange={(e) =>
                      setExtras({ ...extras, crosshairGap: +e.target.value })
                    }
                  />
                </label>
                <label>
                  Crosshair color
                  <input
                    type="color"
                    value={extras.crosshairColor}
                    onChange={(e) =>
                      setExtras({ ...extras, crosshairColor: e.target.value })
                    }
                  />
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={extras.hideScoreboard}
                    onChange={(e) =>
                      setExtras({ ...extras, hideScoreboard: e.target.checked })
                    }
                  />
                  Hide scoreboard
                </label>
                <label>
                  Chat opacity
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={extras.chatOpacity}
                    onChange={(e) =>
                      setExtras({ ...extras, chatOpacity: +e.target.value })
                    }
                  />
                </label>
              </>
            )}
          </div>
          <div className="hud-save">
            <button
              className="primary"
              onClick={() =>
                run("Save HUD layout", () =>
                  request("hud.save", {
                    profile: profile.id,
                    layout: { widgets, toggleSprint, ...extras },
                  }),
                )
              }
            >
              Save layout <Check size={16} />
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
