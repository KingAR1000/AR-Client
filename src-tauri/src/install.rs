use crate::Message;
use crate::{net, state::Profile, Error, Result};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::Arc,
};
pub type Progress = Arc<dyn Fn(Value) + Send + Sync>;
pub const MANIFEST: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
pub fn os() -> &'static str {
    if cfg!(windows) {
        "windows"
    } else if cfg!(target_os = "macos") {
        "osx"
    } else {
        "linux"
    }
}
pub fn allowed(rules: &Value) -> bool {
    let Some(rules) = rules.as_array() else {
        return true;
    };
    let mut allow = false;
    for rule in rules {
        let mut matches = true;
        if let Some(name) = rule["os"]["name"].as_str() {
            matches &= name == os();
        }
        if let Some(arch) = rule["os"]["arch"].as_str() {
            matches &= arch == "x86_64" || arch == "amd64";
        }
        // This launcher never enables demo, quick-play, or custom-resolution feature arguments.
        if let Some(features) = rule["features"].as_object() {
            matches &= features.values().all(|v| v == false);
        }
        if rule["os"].get("version").is_some() {
            matches = false;
        }
        if matches {
            allow = rule["action"] == "allow";
        }
    }
    allow
}
pub fn maven_path(name: &str) -> Result<String> {
    let p: Vec<_> = name.split(':').collect();
    if p.len() < 3
        || p.len() > 4
        || p.iter()
            .any(|x| x.is_empty() || x.contains(['/', '\\']) || x.contains(".."))
    {
        return Err(Error::msg("Invalid Maven coordinate"));
    }
    Ok(format!(
        "{}/{}/{}/{}-{}{}.jar",
        p[0].replace('.', "/"),
        p[1],
        p[2],
        p[1],
        p[2],
        if p.len() == 4 {
            format!("-{}", p[3])
        } else {
            String::new()
        }
    ))
}
pub async fn versions(c: &reqwest::Client) -> Result<Value> {
    let m = net::json(c, MANIFEST).await?;
    let mut list = vec![];
    for v in m["versions"]
        .as_array()
        .ok_or_else(|| Error::msg("Invalid Mojang manifest"))?
    {
        if v["type"] == "release" {
            list.push(v.clone());
            if v["id"] == "1.21.9" {
                break;
            }
        }
    }
    Ok(json!({"latest":m["latest"],"versions":list}))
}
pub async fn loaders(c: &reqwest::Client, kind: &str, version: &str) -> Result<Value> {
    match kind {
        "vanilla" => Ok(json!([])),
        "fabric" | "quilt" => {
            net::json(
                c,
                &format!(
                    "https://meta.{}mc.{}/v{}/versions/loader/{}",
                    kind,
                    if kind == "fabric" { "net" } else { "org" },
                    if kind == "fabric" { 2 } else { 3 },
                    urlencoding(version)
                ),
            )
            .await
        }
        "forge" => {
            let v = net::json(
                c,
                "https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.json",
            )
            .await?;
            Ok(v[version].clone())
        }
        "neoforge" => {
            let v = net::json(
                c,
                "https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge",
            )
            .await?;
            let parts: Vec<_> = version.split('.').collect();
            let prefix = if parts.first() == Some(&"1") {
                format!(
                    "{}.{}.",
                    parts.get(1).unwrap_or(&""),
                    parts.get(2).unwrap_or(&"0")
                )
            } else {
                format!("{version}.")
            };
            Ok(json!(v["versions"]
                .as_array()
                .unwrap_or(&vec![])
                .iter()
                .filter(|x| x.as_str().is_some_and(|s| s.starts_with(&prefix)))
                .collect::<Vec<_>>()))
        }
        _ => Err(Error::msg("Unknown modloader")),
    }
}
pub fn urlencoding(s: &str) -> String {
    url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
}
async fn metadata(c: &reqwest::Client, root: &Path, version: &str) -> Result<Value> {
    let m = versions(c).await?;
    let item = m["versions"]
        .as_array()
        .unwrap()
        .iter()
        .find(|x| x["id"] == version)
        .ok_or_else(|| Error::msg("Version is not a supported official release"))?;
    let path = net::safe_path(root, &format!("versions/{version}/{version}.json"))?;
    net::download(
        c,
        item["url"].as_str().unwrap(),
        &path,
        item["sha1"].as_str().unwrap(),
        "sha1",
    )
    .await?;
    Ok(serde_json::from_slice(&tokio::fs::read(path).await?)?)
}
pub async fn runtime(
    c: &reqwest::Client,
    root: &Path,
    major: u64,
    custom: &str,
    progress: &Progress,
) -> Result<PathBuf> {
    if !custom.trim().is_empty() {
        let p = PathBuf::from(custom);
        check_java(&p, major).await?;
        return Ok(p);
    }
    let runtime_root = root.join("runtimes").join(major.to_string());
    if let Some(p) = find_java(&runtime_root) {
        if check_java(&p, major).await.is_ok() {
            return Ok(p);
        }
    }
    progress(json!({"stage":format!("Installing Java {major}"),"current":0,"total":1}));
    let platform = if cfg!(windows) { "windows" } else { "linux" };
    let v=net::json(c,&format!("https://api.adoptium.net/v3/assets/latest/{major}/hotspot?architecture=x64&image_type=jre&os={platform}&vendor=eclipse")).await?;
    let pkg = &v[0]["binary"]["package"];
    let link=pkg["link"].as_str().ok_or_else(||Error::msg("No compatible Java runtime available. Configure a Java executable in the installation settings."))?;
    let archive = root.join(format!("java-{major}.archive"));
    net::download(
        c,
        link,
        &archive,
        pkg["checksum"]
            .as_str()
            .ok_or_else(|| Error::msg("Runtime checksum missing"))?,
        "sha256",
    )
    .await?;
    std::fs::create_dir_all(&runtime_root)?;
    if cfg!(windows) {
        net::unzip(&archive, &runtime_root, false)?;
    } else {
        let decoder = flate2::read::GzDecoder::new(std::fs::File::open(&archive)?);
        let mut a = tar::Archive::new(decoder);
        for entry in a.entries()? {
            let mut e = entry?;
            if e.header().entry_type().is_symlink() || e.header().entry_type().is_hard_link() {
                continue;
            }
            if !e.unpack_in(&runtime_root)? {
                return Err(Error::msg("Unsafe Java archive"));
            }
        }
    }
    let _ = std::fs::remove_file(archive);
    let p = find_java(&runtime_root)
        .ok_or_else(|| Error::msg("Java executable not found after extraction"))?;
    check_java(&p, major).await?;
    Ok(p)
}
fn find_java(root: &Path) -> Option<PathBuf> {
    let p = root
        .join("bin")
        .join(if cfg!(windows) { "java.exe" } else { "java" });
    if p.is_file() {
        return Some(p);
    }
    for e in std::fs::read_dir(root).ok()?.flatten() {
        if e.path().is_dir() {
            let p = e
                .path()
                .join("bin")
                .join(if cfg!(windows) { "java.exe" } else { "java" });
            if p.is_file() {
                return Some(p);
            }
        }
    }
    None
}
async fn check_java(path: &Path, major: u64) -> Result<()> {
    let out = tokio::process::Command::new(path)
        .arg("-version")
        .output()
        .await?;
    let text = String::from_utf8_lossy(&out.stderr);
    let got = text
        .split('"')
        .nth(1)
        .and_then(|s| s.split('.').next())
        .and_then(|s| s.parse::<u64>().ok());
    if !out.status.success() || got != Some(major) {
        return Err(Error::msg(format!(
            "Minecraft requires Java {major}. Selected executable reports: {}",
            text.lines().next().unwrap_or("unknown")
        )));
    }
    Ok(())
}
pub fn merge(base: &Value, loader: &Value) -> Value {
    let mut result = base.clone();
    for (k, v) in loader.as_object().into_iter().flatten() {
        if k == "libraries" {
            let mut libs = v.as_array().cloned().unwrap_or_default();
            let keys: Vec<String> = libs
                .iter()
                .filter_map(|x| x["name"].as_str())
                .map(|x| x.split(':').take(2).collect::<Vec<_>>().join(":"))
                .collect();
            libs.extend(
                base["libraries"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter(|x| {
                        !keys.contains(
                            &x["name"]
                                .as_str()
                                .unwrap_or("")
                                .split(':')
                                .take(2)
                                .collect::<Vec<_>>()
                                .join(":"),
                        )
                    })
                    .cloned(),
            );
            result[k] = json!(libs);
        } else if k == "arguments" {
            for t in ["jvm", "game"] {
                let mut args = base[k][t].as_array().cloned().unwrap_or_default();
                args.extend(v[t].as_array().into_iter().flatten().cloned());
                result[k][t] = json!(args);
            }
        } else if !["downloads", "assetIndex", "assets", "javaVersion"].contains(&k.as_str()) {
            result[k] = v.clone();
        }
    }
    result
}
fn loader_id(p: &Profile) -> String {
    if p.loader == "forge" {
        format!(
            "{}-forge-{}",
            p.version,
            p.loader_version
                .strip_prefix(&format!("{}-", p.version))
                .unwrap_or(&p.loader_version)
        )
    } else {
        format!("neoforge-{}", p.loader_version)
    }
}
async fn loader_metadata(
    c: &reqwest::Client,
    root: &Path,
    p: &Profile,
    base: &Value,
    java: &Path,
) -> Result<Value> {
    if p.loader == "vanilla" {
        return Ok(base.clone());
    }
    if p.loader_version.is_empty() {
        return Err(Error::msg("Select a compatible modloader version first"));
    }
    let cached = root.join("ar-loader.json");
    let key = format!("{}:{}:{}", p.version, p.loader, p.loader_version);
    if let Ok(bytes) = std::fs::read(&cached) {
        if let Ok(v) = serde_json::from_slice::<Value>(&bytes) {
            if v["key"] == key {
                return Ok(merge(base, &v["metadata"]));
            }
        }
    }
    let meta = if p.loader == "fabric" || p.loader == "quilt" {
        net::json(
            c,
            &format!(
                "https://meta.{}mc.{}/v{}/versions/loader/{}/{}/profile/json",
                p.loader,
                if p.loader == "fabric" { "net" } else { "org" },
                if p.loader == "fabric" { 2 } else { 3 },
                urlencoding(&p.version),
                urlencoding(&p.loader_version)
            ),
        )
        .await?
    } else {
        let choices = loaders(c, &p.loader, &p.version).await?;
        if !choices
            .as_array()
            .is_some_and(|v| v.iter().any(|x| x.as_str() == Some(&p.loader_version)))
        {
            return Err(Error::msg(
                "Selected loader is not listed as compatible with this Minecraft version",
            ));
        }
        let (base_url, artifact, ver) = if p.loader == "forge" {
            (
                "https://maven.minecraftforge.net/net/minecraftforge/forge",
                "forge",
                if p.loader_version.starts_with(&format!("{}-", p.version)) {
                    p.loader_version.clone()
                } else {
                    format!("{}-{}", p.version, p.loader_version)
                },
            )
        } else {
            (
                "https://maven.neoforged.net/releases/net/neoforged/neoforge",
                "neoforge",
                p.loader_version.clone(),
            )
        };
        let url = format!("{base_url}/{ver}/{artifact}-{ver}-installer.jar");
        let hash = c
            .get(net::https(&format!("{url}.sha1"))?)
            .send()
            .await?
            .error_for_status()?
            .text()
            .await?;
        let installer = root.join("loader-installer.jar");
        net::download(
            c,
            &url,
            &installer,
            hash.split_whitespace().next().unwrap_or(""),
            "sha1",
        )
        .await?;
        std::fs::write(root.join("launcher_profiles.json"), b"{\"profiles\":{}}")?;
        let output = tokio::process::Command::new(java)
            .arg("-jar")
            .arg(&installer)
            .arg("--installClient")
            .arg(root)
            .current_dir(root)
            .output()
            .await?;
        std::fs::write(
            root.join("loader-install.log"),
            [output.stdout, output.stderr].concat(),
        )?;
        if !output.status.success() {
            return Err(Error::msg(
                "Modloader installer failed. See loader-install.log in the installation folder.",
            ));
        }
        let mut found = None;
        for e in std::fs::read_dir(root.join("versions"))?.flatten() {
            let id = e.file_name().to_string_lossy().into_owned();
            if id == p.version {
                continue;
            }
            let path = e.path().join(format!("{id}.json"));
            if path.is_file() {
                let v: Value = serde_json::from_slice(&std::fs::read(path)?)?;
                let expected = loader_id(p);
                if v["inheritsFrom"] == p.version && id == expected {
                    found = Some(v);
                }
            }
        }
        found
            .ok_or_else(|| Error::msg("Installer did not create the requested version metadata"))?
    };
    std::fs::write(
        cached,
        serde_json::to_vec(&json!({"key":key,"metadata":meta}))?,
    )?;
    Ok(merge(base, &meta))
}
pub struct Installed {
    pub metadata: Value,
    pub classpath: Vec<PathBuf>,
    pub java: PathBuf,
    pub root: PathBuf,
}
pub async fn install(
    c: &reqwest::Client,
    data: &Path,
    p: &Profile,
    progress: Progress,
) -> Result<Installed> {
    p.validate()?;
    let root = data.join("instances").join(&p.id);
    tokio::fs::create_dir_all(&root).await?;
    progress(json!({"stage":"Checking official version metadata","current":0,"total":1}));
    let base = metadata(c, &root, &p.version).await?;
    let java = runtime(
        c,
        data,
        base["javaVersion"]["majorVersion"].as_u64().unwrap_or(21),
        &p.java,
        &progress,
    )
    .await?;
    let meta = loader_metadata(c, &root, p, &base, &java).await?;
    let client_path = root
        .join("versions")
        .join(&p.version)
        .join(format!("{}.jar", p.version));
    let client = &base["downloads"]["client"];
    net::download(
        c,
        client["url"]
            .as_str()
            .ok_or_else(|| Error::msg("Client URL missing"))?,
        &client_path,
        client["sha1"].as_str().unwrap_or(""),
        "sha1",
    )
    .await?;
    let mut classpath = vec![];
    let libs = meta["libraries"]
        .as_array()
        .ok_or_else(|| Error::msg("Library metadata missing"))?;
    for (i, lib) in libs.iter().enumerate() {
        if !allowed(&lib["rules"]) {
            continue;
        }
        progress(json!({"stage":"Verifying libraries","current":i,"total":libs.len()}));
        let artifact = &lib["downloads"]["artifact"];
        let name = lib["name"]
            .as_str()
            .ok_or_else(|| Error::msg("Library coordinate missing"))?;
        let relative = artifact["path"]
            .as_str()
            .map(String::from)
            .unwrap_or(maven_path(name)?);
        let dest = net::safe_path(&root.join("libraries"), &relative)?;
        if let Some(url) = artifact["url"].as_str() {
            if !url.is_empty() {
                net::download(
                    c,
                    url,
                    &dest,
                    artifact["sha1"].as_str().unwrap_or(""),
                    "sha1",
                )
                .await?;
            }
        } else if lib.get("downloads").is_none() {
            let url = format!(
                "{}{relative}",
                lib["url"]
                    .as_str()
                    .unwrap_or("https://libraries.minecraft.net/")
            );
            let hash = c
                .get(net::https(&format!("{url}.sha1"))?)
                .send()
                .await?
                .error_for_status()?
                .text()
                .await?;
            net::download(
                c,
                &url,
                &dest,
                hash.split_whitespace().next().unwrap_or(""),
                "sha1",
            )
            .await?;
        }
        if dest.is_file() {
            classpath.push(dest);
        }
        if let Some(classifier) = lib["natives"][os()].as_str() {
            let key = classifier.replace("${arch}", "64");
            let a = &lib["downloads"]["classifiers"][&key];
            let path = net::safe_path(
                &root.join("libraries"),
                a["path"]
                    .as_str()
                    .ok_or_else(|| Error::msg("Native path missing"))?,
            )?;
            net::download(
                c,
                a["url"].as_str().unwrap_or(""),
                &path,
                a["sha1"].as_str().unwrap_or(""),
                "sha1",
            )
            .await?;
            net::unzip(&path, &root.join("natives"), true)?;
        }
    }
    classpath.push(client_path);
    let ai = &base["assetIndex"];
    let index = net::safe_path(
        &root.join("assets/indexes"),
        &format!(
            "{}.json",
            ai["id"]
                .as_str()
                .ok_or_else(|| Error::msg("Asset index missing"))?
        ),
    )?;
    net::download(
        c,
        ai["url"].as_str().unwrap_or(""),
        &index,
        ai["sha1"].as_str().unwrap_or(""),
        "sha1",
    )
    .await?;
    let assets: Value = serde_json::from_slice(&std::fs::read(index)?)?;
    let objects = assets["objects"]
        .as_object()
        .ok_or_else(|| Error::msg("Invalid asset index"))?;
    use futures_util::{stream, StreamExt, TryStreamExt};
    let total = objects.len();
    let count = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let downloads: Vec<Value> = objects.values().cloned().collect();
    stream::iter(downloads.into_iter().map(|v| {
        let c = c.clone();
        let root = root.clone();
        let progress = progress.clone();
        let count = count.clone();
        async move {
            let hash = v["hash"]
                .as_str()
                .ok_or_else(|| Error::msg("Asset hash missing"))?;
            if hash.len() != 40 || !hash.bytes().all(|b| b.is_ascii_hexdigit()) {
                return Err(Error::msg("Invalid asset hash"));
            }
            let path = format!("{}/{hash}", &hash[..2]);
            let dest = root.join("assets/objects").join(&path);
            net::download(
                &c,
                &format!("https://resources.download.minecraft.net/{path}"),
                &dest,
                hash,
                "sha1",
            )
            .await?;
            let n = count.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
            if n % 20 == 0 || n == total {
                progress(json!({"stage":"Verifying game assets","current":n,"total":total}));
            }
            Ok::<_, Error>(())
        }
    }))
    .buffer_unordered(6)
    .try_collect::<Vec<_>>()
    .await?;
    if let Some(log) = base["logging"]["client"]["file"].as_object() {
        let dest = net::safe_path(
            &root.join("assets/log_configs"),
            log["id"].as_str().unwrap_or(""),
        )?;
        net::download(
            c,
            log["url"].as_str().unwrap_or(""),
            &dest,
            log["sha1"].as_str().unwrap_or(""),
            "sha1",
        )
        .await?;
    }
    for dir in ["mods", "resourcepacks", "config", "natives"] {
        std::fs::create_dir_all(root.join(dir))?;
    }
    std::fs::write(
        root.join("ar-installed.json"),
        serde_json::to_vec_pretty(&meta)?,
    )?;
    progress(json!({"stage":"Ready to play","current":1,"total":1}));
    Ok(Installed {
        metadata: meta,
        classpath,
        java,
        root,
    })
}
pub fn expand_argument(value: &str, vars: &HashMap<String, String>) -> Result<String> {
    let mut result = value.to_owned();
    for (k, v) in vars {
        result = result.replace(&format!("${{{k}}}"), v);
    }
    if result.contains("${") {
        return Err(Error::msg(format!(
            "Unsupported Minecraft launch argument: {value}"
        )));
    }
    Ok(result)
}
fn arguments(values: &Value, vars: &HashMap<String, String>) -> Result<Vec<String>> {
    let mut out = vec![];
    for v in values.as_array().into_iter().flatten() {
        if let Some(s) = v.as_str() {
            out.push(expand_argument(s, vars)?);
        } else if allowed(&v["rules"]) {
            if let Some(s) = v["value"].as_str() {
                out.push(expand_argument(s, vars)?);
            } else {
                for s in v["value"].as_array().into_iter().flatten() {
                    out.push(expand_argument(
                        s.as_str()
                            .ok_or_else(|| Error::msg("Invalid launch argument"))?,
                        vars,
                    )?);
                }
            }
        }
    }
    Ok(out)
}
pub async fn launch(
    inst: Installed,
    p: &Profile,
    account: &crate::state::Account,
    token: &str,
) -> Result<tokio::process::Child> {
    let root = inst.root;
    let m = inst.metadata;
    let mut vars: HashMap<String, String> = HashMap::new();
    for (k, v) in [
        ("auth_player_name", account.name.clone()),
        ("auth_uuid", account.id.clone()),
        ("auth_access_token", token.into()),
        ("auth_xuid", String::new()),
        ("clientid", String::new()),
        ("user_type", "msa".into()),
        (
            "version_name",
            m["id"].as_str().unwrap_or(&p.version).into(),
        ),
        ("version_type", "release".into()),
        ("game_directory", root.to_string_lossy().into_owned()),
        (
            "assets_root",
            root.join("assets").to_string_lossy().into_owned(),
        ),
        (
            "assets_index_name",
            m["assetIndex"]["id"].as_str().unwrap_or(&p.version).into(),
        ),
        (
            "natives_directory",
            root.join("natives").to_string_lossy().into_owned(),
        ),
        ("launcher_name", "AR Client".into()),
        ("launcher_version", env!("CARGO_PKG_VERSION").into()),
        (
            "library_directory",
            root.join("libraries").to_string_lossy().into_owned(),
        ),
        (
            "classpath_separator",
            if cfg!(windows) { ";" } else { ":" }.into(),
        ),
        (
            "classpath",
            inst.classpath
                .iter()
                .map(|p| p.to_string_lossy())
                .collect::<Vec<_>>()
                .join(if cfg!(windows) { ";" } else { ":" }),
        ),
    ] {
        vars.insert(k.into(), v);
    }
    let mut args = arguments(&m["arguments"]["jvm"], &vars)?;
    args.push(format!("-Xmx{}M", p.ram));
    args.push("-Xms512M".into());
    if let Some(arg) = m["logging"]["client"]["argument"].as_str() {
        let id = m["logging"]["client"]["file"]["id"].as_str().unwrap_or("");
        args.push(arg.replace(
            "${path}",
            &root.join("assets/log_configs").join(id).to_string_lossy(),
        ));
    }
    args.push(
        m["mainClass"]
            .as_str()
            .ok_or_else(|| Error::msg("Main class missing"))?
            .into(),
    );
    args.extend(arguments(&m["arguments"]["game"], &vars)?);
    let stdout = std::fs::File::create(root.join("game-output.log"))?;
    let stderr = stdout.try_clone()?;
    let mut command = tokio::process::Command::new(inst.java);
    command
        .args(args)
        .current_dir(root)
        .stdout(stdout)
        .stderr(stderr)
        .stdin(std::process::Stdio::null());
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    Ok(command.spawn()?)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rules_handle_order_and_features() {
        assert!(allowed(&Value::Null));
        assert!(!allowed(
            &json!([{"action":"allow","features":{"is_demo_user":true}}])
        ));
        assert!(!allowed(&json!([{"action":"allow"},{"action":"disallow"}])));
    }
    #[test]
    fn forge_installer_version_id_is_normalized() {
        let p = Profile {
            id: uuid::Uuid::new_v4().to_string(),
            name: "test".into(),
            version: "1.21.9".into(),
            loader: "forge".into(),
            loader_version: "1.21.9-59.0.5".into(),
            ram: 2048,
            java: String::new(),
            preset: "Custom".into(),
        };
        assert_eq!(loader_id(&p), "1.21.9-forge-59.0.5");
    }
    #[test]
    fn maven_coordinates() {
        assert_eq!(
            maven_path("net.fabricmc:fabric-loader:0.17.2").unwrap(),
            "net/fabricmc/fabric-loader/0.17.2/fabric-loader-0.17.2.jar"
        );
        assert!(maven_path("a:../b:c").is_err());
    }
    #[test]
    fn merges_without_duplicate_library_versions() {
        let a = json!({"libraries":[{"name":"g:a:1"}],"arguments":{"jvm":["a"],"game":[]}});
        let b = json!({"libraries":[{"name":"g:a:2"}],"arguments":{"jvm":["b"]}});
        let m = merge(&a, &b);
        assert_eq!(m["libraries"].as_array().unwrap().len(), 1);
        assert_eq!(m["arguments"]["jvm"], json!(["a", "b"]));
    }
    #[test]
    fn unresolved_arguments_fail() {
        assert!(expand_argument("${missing}", &HashMap::new()).is_err());
    }
}
