import { useEffect, useRef, useState } from "react";

import { ArrowUpRight, Plus, Trash2 } from "lucide-react";

import { fileData, request, type LauncherState } from "../api";

import { SkinViewer } from "skinview3d";
import type { Run } from "../api";
import Empty from "./Empty";
export default function Skins({
  state,
  run,
  fail,
  busy,
}: {
  state: LauncherState;
  run: Run;
  fail: (e: unknown) => void;
  busy: boolean;
}) {
  const [skins, setSkins] = useState<{ name: string; data: string }[]>([]),
    [selected, setSelected] = useState(""),
    [model, setModel] = useState<"classic" | "slim">("classic");
  const canvas = useRef<HTMLCanvasElement>(null);
  const account = state.accounts.find((a) => a.id === state.activeAccount);
  const skin = skins.find((s) => s.name === selected);
  async function load() {
    setSkins(await request("skin.list"));
  }
  useEffect(() => {
    load().catch(fail);
  }, []);
  useEffect(() => {
    if (!canvas.current) return;
    const v = new SkinViewer({
      canvas: canvas.current,
      width: 360,
      height: 420,
    });
    v.controls.enableZoom = true;
    v.autoRotate = true;
    v.background = 0x151515;
    if (skin || account?.skin)
      v.loadSkin(skin?.data || account!.skin!, {
        model: model === "classic" ? "default" : "slim",
      }).catch(fail);
    return () => v.dispose();
  }, [skin?.data, account?.skin, model]);
  return (
    <div className="skin-layout">
      <section className="panel skin-preview">
        <span className="eyebrow">3D PREVIEW</span>
        <canvas ref={canvas} />
        {!skin && !account?.skin && <p>Import a skin to preview it here.</p>}
        <small>Drag to rotate · Scroll to zoom</small>
        <div className="tabs">
          {(["classic", "slim"] as const).map((m) => (
            <button
              key={m}
              className={model === m ? "active" : ""}
              onClick={() => setModel(m)}
            >
              {m}
            </button>
          ))}
        </div>
        <button
          className="primary"
          disabled={!skin || busy || !account}
          onClick={() =>
            run("Upload Minecraft skin", () =>
              request("skin.upload", { name: selected, model }),
            )
          }
        >
          Apply to Minecraft <ArrowUpRight size={16} />
        </button>
      </section>
      <div>
        <section className="panel">
          <div className="section-title">
            <h3>Your skin library</h3>
            <label className="file-button secondary">
              <Plus size={16} />
              Import PNG
              <input
                type="file"
                accept="image/png"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f)
                    run("Import skin", async () => {
                      const name = await request<string>("skin.import", {
                        data: await fileData(f),
                      });
                      await load();
                      setSelected(name);
                    });
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <div className="skin-grid">
            {skins.map((s) => (
              <div
                className={`skin-card ${selected === s.name ? "selected" : ""}`}
                key={s.name}
              >
                <button onClick={() => setSelected(s.name)}>
                  <img src={s.data} alt="Saved Minecraft skin texture" />
                </button>
                <button
                  className="icon-button"
                  title="Delete saved skin"
                  onClick={() =>
                    run("Delete skin", async () => {
                      await request("skin.delete", { name: s.name });
                      await load();
                      if (selected === s.name) setSelected("");
                    })
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          {!skins.length && (
            <Empty
              title="No saved skins"
              text="Import a 64×64 or 64×32 Minecraft PNG skin."
            />
          )}
        </section>
        <section className="panel">
          <h3>Owned capes</h3>
          <p className="muted">
            Only capes owned by your active Microsoft account can be equipped.
          </p>
          <select
            aria-label="Select owned cape"
            disabled={!account || busy}
            onChange={(e) =>
              run("Change cape", () =>
                request("cape.select", { cape: e.target.value }),
              )
            }
            defaultValue=""
          >
            <option value="">No cape</option>
            {account?.capes.map((c) => (
              <option value={c.id} key={c.id}>
                {c.alias || c.id}
              </option>
            ))}
          </select>
        </section>
      </div>
    </div>
  );
}
