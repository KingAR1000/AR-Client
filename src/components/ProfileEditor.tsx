import { useEffect, useState } from "react";

import { Check, ShieldCheck, X } from "lucide-react";

import { loaderChoices, request, type Profile } from "../api";

export default function ProfileEditor({
  profile,
  versions,
  latest,
  close,
  save,
  fail,
}: {
  profile: Profile;
  versions: string[];
  latest: string;
  close: () => void;
  save: (p: Profile) => unknown;
  fail: (e: unknown) => void;
}) {
  const [p, setP] = useState(profile),
    [loaders, setLoaders] = useState<string[]>([]),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    setLoaders([]);
    if (p.loader === "vanilla" || !p.version) {
      setLoading(false);
      return;
    }
    setLoading(true);
    request("loaders", { loader: p.loader, version: p.version })
      .then((v) => {
        if (active) setLoaders(loaderChoices(v));
      })
      .catch((error) => {
        if (active) fail(error);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [p.loader, p.version]);
  const field = (key: keyof Profile, value: string | number) =>
    setP((s) => ({ ...s, [key]: value }));
  return (
    <div className="modal-backdrop">
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault();
          save(p);
        }}
      >
        <div className="section-title">
          <div>
            <h2>{p.id ? "Configure installation" : "New installation"}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            onClick={close}
          >
            <X />
          </button>
        </div>
        <label>
          Name
          <input
            required
            maxLength={80}
            value={p.name}
            onChange={(e) => field("name", e.target.value)}
          />
        </label>
        <div className="form-grid">
          <label>
            Minecraft version
            <select
              required
              value={p.version}
              onChange={(e) => {
                field("version", e.target.value);
                field("loaderVersion", "");
              }}
            >
              <option value="">Select official release</option>
              {versions.map((v) => (
                <option key={v} value={v}>
                  {v}
                  {v === latest
                    ? " — Latest stable"
                    : v === "1.21.9"
                      ? " — Oldest supported"
                      : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Modloader
            <select
              value={p.loader}
              onChange={(e) => {
                field("loader", e.target.value);
                field("loaderVersion", "");
              }}
            >
              {["vanilla", "fabric", "forge", "neoforge", "quilt"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        </div>
        {!p.id && (
          <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>
            New installations use the latest official stable release. Choose a
            compatible modloader if you want mods; existing installations keep
            their selected version.
          </p>
        )}
        {p.loader !== "vanilla" && (
          <label>
            Loader version
            <select
              required
              value={p.loaderVersion}
              onChange={(e) => field("loaderVersion", e.target.value)}
            >
              <option value="">
                {loading
                  ? "Checking compatibility…"
                  : loaders.length
                    ? "Select compatible loader"
                    : "No compatible loader listed"}
              </option>
              {loaders.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          Memory <span>{p.ram / 1024} GB</span>
          <input
            type="range"
            min="1024"
            max="16384"
            step="512"
            value={p.ram}
            onChange={(e) => field("ram", +e.target.value)}
          />
        </label>
        <label>
          Performance preset
          <select
            value={p.preset}
            onChange={(e) => field("preset", e.target.value)}
          >
            {["Maximum FPS", "Balanced", "High Quality", "Custom"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <small>
            Apply your preset from Settings in the installation list below after
            saving.
          </small>
        </label>
        <label>
          Custom Java executable <span>optional</span>
          <input
            value={p.java}
            onChange={(e) => field("java", e.target.value)}
            placeholder="Automatic — verified Eclipse Temurin runtime"
          />
        </label>
        <div className="callout">
          <ShieldCheck size={19} />
          <span>
            Each installation has its own worlds, mods, configuration, and game
            files.
          </span>
        </div>
        <div className="panel-footer">
          <button type="button" className="secondary" onClick={close}>
            Cancel
          </button>
          <button className="primary" type="submit">
            Save installation <Check size={16} />
          </button>
        </div>
      </form>
    </div>
  );
}
