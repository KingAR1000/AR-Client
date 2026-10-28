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
export default function Catalog({
  page,
  profile,
  run,
  fail,
  busy,
  create,
}: {
  page: Page;
  profile?: Profile;
  run: Run;
  fail: (e: unknown) => void;
  busy: boolean;
  create: () => void;
}) {
  const kind =
    page === "Mods"
      ? "mod"
      : page === "Resource Packs"
        ? "resourcepack"
        : "modpack";
  const [source, setSource] = useState("modrinth"),
    [query, setQuery] = useState(""),
    [hits, setHits] = useState<any[]>([]),
    [installed, setInstalled] = useState<Content[]>([]),
    [tab, setTab] = useState("Discover"),
    [loading, setLoading] = useState(false),
    [offset, setOffset] = useState(0),
    [error, setError] = useState("");
  async function load(start = 0) {
    if (!profile) return;
    setLoading(true);
    setError("");
    try {
      const v = await request<{ hits: any[] }>("catalog", {
        source,
        kind,
        query,
        profile: profile.id,
        offset: start,
      });
      setHits(v.hits);
      setOffset(start);
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }
  async function owned() {
    if (profile)
      setInstalled(
        await request<Content[]>("content.list", { profile: profile.id }),
      );
  }
  useEffect(() => {
    load();
    owned().catch(fail);
  }, [source]);
  if (!profile)
    return (
      <section className="panel">
        <Empty
          title="Choose a home for your content"
          text="Compatibility depends on the Minecraft version and modloader in your installation."
          action="Create installation"
          onClick={create}
        />
      </section>
    );
  return (
    <>
      <div className="catalog-toolbar">
        <div className="tabs">
          {["Discover", "Installed"].map((t) => (
            <button
              key={t}
              className={tab === t ? "active" : ""}
              onClick={() => {
                setTab(t);
                if (t === "Installed") owned().catch(fail);
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="row">
          <label className="file-button secondary">
            <Plus size={16} />
            Import
            <input
              type="file"
              accept={
                kind === "mod"
                  ? ".jar"
                  : kind === "modpack"
                    ? ".mrpack,.zip"
                    : ".zip"
              }
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f)
                  run("Import content", async () => {
                    await request("file.import", {
                      profile: profile.id,
                      kind,
                      filename: f.name,
                      data: await fileData(f),
                    });
                    await owned();
                  });
                e.target.value = "";
              }}
            />
          </label>
          <select
            aria-label="Content source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="modrinth">Modrinth</option>
            <option value="curseforge">CurseForge</option>
          </select>
        </div>
      </div>
      {tab === "Discover" ? (
        <>
          <form
            className="search-bar"
            onSubmit={(e) => {
              e.preventDefault();
              load();
            }}
          >
            <Search size={19} />
            <input
              aria-label="Search catalog"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${page.toLowerCase()}…`}
            />
            <span className="filter-chip">
              {profile.version} · {profile.loader}
            </span>
            <button className="secondary" disabled={loading}>
              Search
            </button>
          </form>
          {error ? (
            <div className="callout error">
              {error}
              <button className="text-button" onClick={() => load()}>
                Retry
              </button>
            </div>
          ) : loading ? (
            <div className="loading">
              <LoaderCircle className="spin" />
              Loading compatible projects…
            </div>
          ) : (
            <div className="catalog-grid">
              {hits.map((h) => (
                <article className="project-card" key={h.project_id}>
                  <div className="project-top">
                    {h.icon_url ? (
                      <img src={h.icon_url} alt="" loading="lazy" />
                    ) : (
                      <div className="tile-icon">
                        <Package />
                      </div>
                    )}
                    <span>
                      {new Intl.NumberFormat("en", {
                        notation: "compact",
                      }).format(h.downloads || 0)}{" "}
                      installs
                    </span>
                  </div>
                  <h3>{h.title}</h3>
                  <small>by {h.author || source}</small>
                  <p>{h.description}</p>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      run(`Install ${h.title}`, async () => {
                        await request("content.install", {
                          profile: profile.id,
                          source,
                          project: h.project_id,
                          kind,
                        });
                        await owned();
                      })
                    }
                  >
                    <Download size={15} />
                    Install compatible release
                  </button>
                </article>
              ))}
            </div>
          )}
          {!loading && !error && !hits.length && (
            <Empty
              title="No compatible results"
              text="Try a different search, version, or modloader."
            />
          )}
          <div className="pagination">
            <button
              className="secondary"
              disabled={offset === 0 || loading}
              onClick={() => load(Math.max(0, offset - 20))}
            >
              Previous
            </button>
            <span>Page {offset / 20 + 1}</span>
            <button
              className="secondary"
              disabled={hits.length < 20 || loading}
              onClick={() => load(offset + 20)}
            >
              Next
            </button>
          </div>
        </>
      ) : (
        <section className="panel">
          <div className="section-title">
            <h3>Managed {page.toLowerCase()}</h3>
            <button
              className="text-button"
              onClick={() =>
                request("folder.open", { id: profile.id }).catch(fail)
              }
            >
              Open installation folder <ExternalLink size={14} />
            </button>
          </div>
          <p className="muted">
            Manually imported files are available in the installation folder.
            Catalog installs are tracked below.
          </p>
          {installed
            .filter((x) => x.kind === kind)
            .map((x, i) => (
              <div key={x.filename} className="installation-row">
                <Box size={20} />
                <div className="grow">
                  <h3>{x.filename}</h3>
                  <small>
                    {x.source} · {x.versionId}
                  </small>
                </div>
                {kind === "resourcepack" && (
                  <>
                    <button
                      className="icon-button"
                      title="Move pack up"
                      disabled={i === 0}
                      onClick={() => {
                        const pack = installed.filter((x) => x.kind === kind);
                        [pack[i - 1], pack[i]] = [pack[i], pack[i - 1]];
                        setInstalled([
                          ...installed.filter((x) => x.kind !== kind),
                          ...pack,
                        ]);
                      }}
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      className="icon-button"
                      title="Move pack down"
                      disabled={
                        i ===
                        installed.filter((x) => x.kind === kind).length - 1
                      }
                      onClick={() => {
                        const pack = installed.filter((x) => x.kind === kind);
                        [pack[i + 1], pack[i]] = [pack[i], pack[i + 1]];
                        setInstalled([
                          ...installed.filter((x) => x.kind !== kind),
                          ...pack,
                        ]);
                      }}
                    >
                      <ArrowDown size={16} />
                    </button>
                  </>
                )}
                <button
                  className="icon-button danger"
                  title="Remove content"
                  disabled={busy}
                  onClick={() =>
                    run("Remove content", async () => {
                      await request("content.remove", {
                        profile: profile.id,
                        filename: x.filename,
                      });
                      await owned();
                    })
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          {kind === "resourcepack" && (
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                run("Apply resource pack order", () =>
                  request("packs.order", {
                    profile: profile.id,
                    names: installed
                      .filter((x) => x.kind === kind)
                      .map((x) => x.filename),
                  }),
                )
              }
            >
              Enable packs in this order
            </button>
          )}
          {!installed.some((x) => x.kind === kind) && (
            <Empty
              title="Nothing installed from the catalog yet"
              text="Discover compatible content and add it to this installation."
            />
          )}
        </section>
      )}
    </>
  );
}
