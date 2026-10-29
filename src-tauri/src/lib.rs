pub mod auth;
pub mod catalog;
pub mod install;
pub mod net;
pub mod state;
use base64::Engine as _;
use serde_json::{json, Value};
use std::{path::PathBuf, sync::Arc};
pub type Error = Box<dyn std::error::Error + Send + Sync>;
pub type Result<T> = std::result::Result<T, Error>;
trait Message {
    fn msg(s: impl Into<String>) -> Error;
}
impl Message for Error {
    fn msg(s: impl Into<String>) -> Error {
        std::io::Error::other(s.into()).into()
    }
}
fn text<'a>(v: &'a Value, key: &str) -> Result<&'a str> {
    v[key]
        .as_str()
        .ok_or_else(|| Error::msg(format!("Missing {key}")))
}
pub struct Engine {
    pub root: PathBuf,
    pub companion: Option<PathBuf>,
    pub client: reqwest::Client,
    pub progress: install::Progress,
    device: tokio::sync::Mutex<Option<Value>>,
    mutation: tokio::sync::Mutex<()>,
    running: Arc<tokio::sync::Mutex<std::collections::HashSet<String>>>,
}
impl Engine {
    pub fn new(root: PathBuf, progress: install::Progress) -> Self {
        Self {
            root,
            companion: None,
            client: net::client(),
            progress,
            device: tokio::sync::Mutex::new(None),
            mutation: tokio::sync::Mutex::new(()),
            running: Arc::new(tokio::sync::Mutex::new(std::collections::HashSet::new())),
        }
    }
    pub async fn dispatch(&self, action: &str, a: Value) -> Result<Value> {
        let read_only = ["versions", "loaders", "catalog", "releases"];
        let _guard = if read_only.contains(&action) {
            None
        } else {
            Some(self.mutation.lock().await)
        };
        let mut state = state::read(&self.root)?;
        let find = |id: &str| -> Result<state::Profile> {
            state
                .profiles
                .iter()
                .find(|p| p.id == id)
                .cloned()
                .ok_or_else(|| Error::msg("Installation not found"))
        };
        match action {
            "state" => {
                let mut v = serde_json::to_value(state)?;
                v["running"] = json!(*self.running.lock().await);
                v["version"] = json!(env!("CARGO_PKG_VERSION"));
                v["curseforgeConfigured"] = json!(state::secret_get("curseforge").is_ok());
                Ok(v)
            }
            "versions" => install::versions(&self.client).await,
            "loaders" => {
                install::loaders(&self.client, text(&a, "loader")?, text(&a, "version")?).await
            }
            "profile.save" => {
                let mut p: state::Profile = serde_json::from_value(a)?;
                if p.id.is_empty() {
                    p.id = uuid::Uuid::new_v4().to_string();
                }
                p.validate()?;
                if self.running.lock().await.contains(&p.id) {
                    return Err(Error::msg(
                        "Close Minecraft before editing this installation",
                    ));
                }
                if let Some(index) = state.profiles.iter().position(|x| x.id == p.id) {
                    state.profiles[index] = p.clone();
                } else {
                    state.profiles.push(p.clone());
                }
                state::write(&self.root, &state)?;
                Ok(json!(p))
            }
            "profile.delete" => {
                let p = find(text(&a, "id")?)?;
                self.ensure_stopped(&p.id).await?;
                let path = self.root.join("instances").join(&p.id);
                if path.exists() {
                    let trash = self.root.join("trash");
                    std::fs::create_dir_all(&trash)?;
                    std::fs::rename(
                        path,
                        trash.join(format!("{}-{}", p.id, uuid::Uuid::new_v4())),
                    )?;
                }
                state.profiles.retain(|x| x.id != p.id);
                state::write(&self.root, &state)?;
                Ok(json!(true))
            }
            "profile.duplicate" => {
                let p = find(text(&a, "id")?)?;
                self.ensure_stopped(&p.id).await?;
                let mut copy = p.clone();
                copy.id = uuid::Uuid::new_v4().to_string();
                copy.name = format!("{} (copy)", p.name);
                let source = self.root.join("instances").join(&p.id);
                if source.exists() {
                    catalog::copy_tree(&source, &self.root.join("instances").join(&copy.id))?;
                }
                state.profiles.push(copy.clone());
                state::write(&self.root, &state)?;
                Ok(json!(copy))
            }
            "settings.save" => {
                let id = text(&a, "microsoftClientId")?;
                if !id.is_empty() {
                    uuid::Uuid::parse_str(id)?;
                }
                state.settings = json!({"microsoftClientId":id,"eulaAccepted":a["eulaAccepted"].as_bool().unwrap_or(false)});
                state::write(&self.root, &state)?;
                Ok(json!(true))
            }
            "curseforge.key" => {
                let key = text(&a, "key")?;
                if key.is_empty() {
                    state::secret_delete("curseforge")?;
                } else {
                    state::secret_set("curseforge", key)?;
                }
                Ok(json!(true))
            }
            "auth.start" => {
                let id = state.settings["microsoftClientId"].as_str().unwrap_or("");
                let mut d = auth::start(&self.client, id).await?;
                d["started"] = json!(std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)?
                    .as_secs());
                d["lastPoll"] = json!(0);
                let public = json!({"userCode":d["user_code"],"verificationUri":d["verification_uri"],"expiresIn":d["expires_in"],"interval":d["interval"]});
                *self.device.lock().await = Some(d);
                Ok(public)
            }
            "auth.poll" => {
                let mut guard = self.device.lock().await;
                let d = guard
                    .as_mut()
                    .ok_or_else(|| Error::msg("Start a new sign-in"))?;
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)?
                    .as_secs();
                if now
                    > d["started"].as_u64().unwrap_or(0) + d["expires_in"].as_u64().unwrap_or(900)
                {
                    *guard = None;
                    return Err(Error::msg("Sign-in expired. Try again."));
                }
                if now < d["lastPoll"].as_u64().unwrap_or(0) + d["interval"].as_u64().unwrap_or(5) {
                    return Ok(json!({"pending":true}));
                }
                d["lastPoll"] = json!(now);
                let id = state.settings["microsoftClientId"].as_str().unwrap_or("");
                match auth::poll(&self.client, id, d["device_code"].as_str().unwrap_or("")).await {
                    Ok(Some((account, tokens))) => {
                        state::secret_set(&account.id, &tokens.to_string())?;
                        state.accounts.retain(|x| x.id != account.id);
                        state.active_account = Some(account.id.clone());
                        state.accounts.push(account);
                        state::write(&self.root, &state)?;
                        *guard = None;
                        Ok(json!({"pending":false}))
                    }
                    Ok(None) => Ok(json!({"pending":true})),
                    Err(e) if e.to_string() == "slow_down" => {
                        d["interval"] = json!(d["interval"].as_u64().unwrap_or(5) + 5);
                        Ok(json!({"pending":true}))
                    }
                    Err(e) => {
                        *guard = None;
                        Err(e)
                    }
                }
            }
            "auth.cancel" => {
                *self.device.lock().await = None;
                Ok(json!(true))
            }
            "account.select" | "account.remove" => {
                let id = text(&a, "id")?;
                if !state.accounts.iter().any(|x| x.id == id) {
                    return Err(Error::msg("Account not found"));
                }
                if action == "account.select" {
                    state.active_account = Some(id.into());
                } else {
                    state::secret_delete(id)?;
                    state.accounts.retain(|x| x.id != id);
                    if state.active_account.as_deref() == Some(id) {
                        state.active_account = state.accounts.first().map(|x| x.id.clone());
                    }
                }
                state::write(&self.root, &state)?;
                Ok(json!(true))
            }
            "install" | "launch" => {
                let p = find(text(&a, "id")?)?;
                self.ensure_stopped(&p.id).await?;
                if state.settings["eulaAccepted"] != true {
                    return Err(Error::msg(
                        "Read and accept Minecraft's EULA in Settings before installation.",
                    ));
                }
                let credentials = if action == "launch" {
                    let account=state.accounts.iter().find(|x|Some(&x.id)==state.active_account.as_ref()).ok_or_else(||Error::msg("Sign in to a Microsoft account that owns Minecraft Java before playing."))?.clone();
                    let token = auth::access(
                        &self.client,
                        state.settings["microsoftClientId"].as_str().unwrap_or(""),
                        &account.id,
                    )
                    .await?;
                    Some((account, token))
                } else {
                    None
                };
                let installed =
                    install::install(&self.client, &self.root, &p, self.progress.clone()).await?;
                if p.loader == "fabric" && p.version == "1.21.9" {
                    if let Some(resources) = &self.companion {
                        let metadata: Value = serde_json::from_slice(&std::fs::read(
                            resources.join("companion.json"),
                        )?)?;
                        let jar = resources.join("ar-client-fabric.jar");
                        if !net::verify(&jar, metadata["sha256"].as_str().unwrap_or(""), "sha256")
                            .await?
                        {
                            return Err(Error::msg(
                                "Bundled AR companion failed integrity verification",
                            ));
                        }
                        catalog::install(
                            &self.client,
                            &installed.root,
                            &p,
                            "modrinth",
                            "fabric-api",
                            "mod",
                            self.progress.clone(),
                        )
                        .await?;
                        std::fs::copy(jar, installed.root.join("mods/ar-client-fabric.jar"))?;
                    }
                }
                if let Some((account, token)) = credentials {
                    let mut child = install::launch(installed, &p, &account, &token).await?;
                    self.running.lock().await.insert(p.id.clone());
                    let running = self.running.clone();
                    let progress = self.progress.clone();
                    let id = p.id.clone();
                    tokio::spawn(async move {
                        let result = child.wait().await;
                        running.lock().await.remove(&id);
                        progress(
                            json!({"stage":if result.as_ref().is_ok_and(|s|s.success()){"Minecraft closed"}else{"Minecraft exited with an error. Open the installation folder and check game-output.log."},"current":1,"total":1,"exited":id}),
                        );
                    });
                }
                Ok(json!(true))
            }
            "catalog" => {
                let p = find(text(&a, "profile")?)?;
                catalog::search(
                    &self.client,
                    text(&a, "source")?,
                    text(&a, "kind")?,
                    a["query"].as_str().unwrap_or(""),
                    &p,
                    a["offset"].as_u64().unwrap_or(0).min(10000),
                )
                .await
            }
            "content.list" => {
                let p = find(text(&a, "profile")?)?;
                Ok(json!(catalog::list_content(
                    &self.root.join("instances").join(&p.id)
                )?))
            }
            "content.install" => {
                let p = find(text(&a, "profile")?)?;
                self.ensure_stopped(&p.id).await?;
                catalog::install(
                    &self.client,
                    &self.root.join("instances").join(&p.id),
                    &p,
                    text(&a, "source")?,
                    text(&a, "project")?,
                    text(&a, "kind")?,
                    self.progress.clone(),
                )
                .await
            }
            "content.remove" => {
                let p = find(text(&a, "profile")?)?;
                self.ensure_stopped(&p.id).await?;
                catalog::remove(
                    &self.root.join("instances").join(&p.id),
                    text(&a, "filename")?,
                )?;
                Ok(json!(true))
            }
            "content.updates" => {
                let p = find(text(&a, "profile")?)?;
                let mut result = vec![];
                for item in catalog::read_lock(&self.root.join("instances").join(&p.id))? {
                    let versions = catalog::project_versions(
                        &self.client,
                        text(&item, "source")?,
                        text(&item, "projectId")?,
                        &p,
                        text(&item, "kind")?,
                    )
                    .await?;
                    if let Some(v) = versions.as_array().and_then(|v| v.first()) {
                        let id = if v["id"].is_string() {
                            v["id"].as_str().unwrap().to_string()
                        } else {
                            v["id"].to_string()
                        };
                        if item["versionId"] != id {
                            result.push(json!({"installed":item,"available":v}));
                        }
                    }
                }
                Ok(json!(result))
            }
            "packs.order" => {
                let p = find(text(&a, "profile")?)?;
                self.ensure_stopped(&p.id).await?;
                let names: Vec<String> = serde_json::from_value(a["names"].clone())?;
                catalog::order_packs(&self.root.join("instances").join(&p.id), &names)?;
                Ok(json!(true))
            }
            "file.import" => {
                let p = find(text(&a, "profile")?)?;
                self.ensure_stopped(&p.id).await?;
                let kind = text(&a, "kind")?;
                let filename = text(&a, "filename")?;
                let bytes = base64::engine::general_purpose::STANDARD.decode(text(&a, "data")?)?;
                if bytes.len() > 256 * 1024 * 1024 {
                    return Err(Error::msg("Import exceeds 256 MiB limit"));
                }
                let folder = match kind {
                    "mod" if filename.ends_with(".jar") => "mods",
                    "resourcepack" if filename.ends_with(".zip") => "resourcepacks",
                    "modpack" if filename.ends_with(".mrpack") || filename.ends_with(".zip") => {
                        "imports"
                    }
                    _ => return Err(Error::msg("Unsupported import type")),
                };
                if filename.contains('/') {
                    return Err(Error::msg("Invalid filename"));
                }
                let root = self.root.join("instances").join(&p.id);
                let dest = net::safe_path(&root.join(folder), filename)?;
                if dest.exists() {
                    return Err(Error::msg("A file with this name already exists"));
                }
                std::fs::create_dir_all(dest.parent().unwrap())?;
                std::fs::write(&dest, &bytes)?;
                if kind == "modpack" {
                    catalog::import_pack(
                        &self.client,
                        &root,
                        &p,
                        &dest,
                        if filename.ends_with(".mrpack") {
                            "modrinth"
                        } else {
                            "curseforge"
                        },
                        &self.progress,
                    )
                    .await?;
                }
                Ok(json!(true))
            }
            "preset.apply" => {
                let p = find(text(&a, "profile")?)?;
                self.ensure_stopped(&p.id).await?;
                let root = self.root.join("instances").join(&p.id);
                std::fs::create_dir_all(&root)?;
                let options = root.join("options.txt");
                let old = std::fs::read_to_string(&options).unwrap_or_default();
                let (distance, graphics, fps) = match p.preset.as_str() {
                    "Maximum FPS" => (8, 0, 260),
                    "High Quality" => (20, 2, 120),
                    "Balanced" => (12, 1, 180),
                    _ => return Ok(json!(true)),
                };
                let mut lines: Vec<String> = old
                    .lines()
                    .filter(|s| {
                        ![
                            "renderDistance:",
                            "simulationDistance:",
                            "graphicsMode:",
                            "maxFps:",
                            "enableVsync:",
                        ]
                        .iter()
                        .any(|x| s.starts_with(x))
                    })
                    .map(str::to_owned)
                    .collect();
                lines.extend([
                    format!("renderDistance:{distance}"),
                    "simulationDistance:6".into(),
                    format!("graphicsMode:{graphics}"),
                    format!("maxFps:{fps}"),
                    "enableVsync:false".into(),
                ]);
                std::fs::write(options, lines.join("\n") + "\n")?;
                if p.loader == "fabric" {
                    for id in ["sodium", "lithium"] {
                        catalog::install(
                            &self.client,
                            &root,
                            &p,
                            "modrinth",
                            id,
                            "mod",
                            self.progress.clone(),
                        )
                        .await?;
                    }
                }
                Ok(json!(true))
            }
            "hud.load" | "hud.save" => {
                let p = find(text(&a, "profile")?)?;
                let path = self
                    .root
                    .join("instances")
                    .join(&p.id)
                    .join("config/ar-client.json");
                if action == "hud.load" {
                    if !path.exists() {
                        return Ok(json!({"widgets":[],"toggleSprint":false}));
                    }
                    return Ok(serde_json::from_slice(&std::fs::read(path)?)?);
                }
                self.ensure_stopped(&p.id).await?;
                let data = &a["layout"];
                if data.to_string().len() > 65536 {
                    return Err(Error::msg("HUD layout too large"));
                }
                std::fs::create_dir_all(path.parent().unwrap())?;
                std::fs::write(path, serde_json::to_vec_pretty(data)?)?;
                Ok(json!(true))
            }
            "skin.list" => {
                let root = self.root.join("skins");
                std::fs::create_dir_all(&root)?;
                let mut skins = vec![];
                for e in std::fs::read_dir(root)?.flatten() {
                    if e.path().extension().is_some_and(|x| x == "png") {
                        let bytes = std::fs::read(e.path())?;
                        skins.push(json!({"name":e.file_name().to_string_lossy(),"data":format!("data:image/png;base64,{}",base64::engine::general_purpose::STANDARD.encode(bytes))}));
                    }
                }
                Ok(json!(skins))
            }
            "skin.import" => {
                let name = format!("{}.png", uuid::Uuid::new_v4());
                let bytes = base64::engine::general_purpose::STANDARD.decode(text(&a, "data")?)?;
                validate_skin(&bytes)?;
                std::fs::create_dir_all(self.root.join("skins"))?;
                std::fs::write(self.root.join("skins").join(&name), bytes)?;
                Ok(json!(name))
            }
            "skin.delete" => {
                let path = net::safe_path(&self.root.join("skins"), text(&a, "name")?)?;
                std::fs::remove_file(path)?;
                Ok(json!(true))
            }
            "skin.upload" | "cape.select" => {
                let id = state
                    .active_account
                    .as_deref()
                    .ok_or_else(|| Error::msg("Sign in first"))?;
                let token = auth::access(
                    &self.client,
                    state.settings["microsoftClientId"].as_str().unwrap_or(""),
                    id,
                )
                .await?;
                if action == "cape.select" {
                    let cape = text(&a, "cape")?;
                    if cape.is_empty() {
                        self.client
                            .delete(
                                "https://api.minecraftservices.com/minecraft/profile/capes/active",
                            )
                            .bearer_auth(token)
                            .send()
                            .await?
                            .error_for_status()?;
                    } else {
                        let account = state.accounts.iter().find(|x| x.id == id).unwrap();
                        if !account.capes.iter().any(|x| x["id"] == cape) {
                            return Err(Error::msg("This account does not own that cape"));
                        }
                        self.client
                            .put("https://api.minecraftservices.com/minecraft/profile/capes/active")
                            .bearer_auth(token)
                            .json(&json!({"capeId":cape}))
                            .send()
                            .await?
                            .error_for_status()?;
                    }
                } else {
                    let path = net::safe_path(&self.root.join("skins"), text(&a, "name")?)?;
                    let bytes = std::fs::read(path)?;
                    validate_skin(&bytes)?;
                    let variant = text(&a, "model")?;
                    if !["classic", "slim"].contains(&variant) {
                        return Err(Error::msg("Invalid skin model"));
                    }
                    let form = reqwest::multipart::Form::new()
                        .text("variant", variant.to_owned())
                        .part(
                            "file",
                            reqwest::multipart::Part::bytes(bytes)
                                .file_name("skin.png")
                                .mime_str("image/png")?,
                        );
                    self.client
                        .post("https://api.minecraftservices.com/minecraft/profile/skins")
                        .bearer_auth(token)
                        .multipart(form)
                        .send()
                        .await?
                        .error_for_status()?;
                }
                Ok(json!(true))
            }
            "releases" => {
                net::json(
                    &self.client,
                    "https://api.github.com/repos/KingAR1000/AR-Client/releases",
                )
                .await
            }
            "folder.open" => {
                let path = if let Some(id) = a["id"].as_str() {
                    let p = find(id)?;
                    self.root.join("instances").join(p.id)
                } else {
                    self.root.clone()
                };
                std::fs::create_dir_all(&path)?;
                open_path(&path)?;
                Ok(json!(true))
            }
            "link.open" => {
                let link = text(&a, "url")?;
                let u = net::https(link)?;
                if ![
                    "www.minecraft.net",
                    "minecraft.net",
                    "www.microsoft.com",
                    "microsoft.com",
                    "login.microsoftonline.com",
                    "github.com",
                    "kingar1000.xyz",
                    "client.kingar1000.xyz",
                    "modrinth.com",
                    "www.curseforge.com",
                ]
                .contains(&u.host_str().unwrap_or(""))
                {
                    return Err(Error::msg("External link host is not allowed"));
                }
                open_url(link)?;
                Ok(json!(true))
            }
            _ => Err(Error::msg("Unknown launcher command")),
        }
    }
    async fn ensure_stopped(&self, id: &str) -> Result<()> {
        if self.running.lock().await.contains(id) {
            Err(Error::msg(
                "Close Minecraft before modifying this installation",
            ))
        } else {
            Ok(())
        }
    }
}
fn validate_skin(bytes: &[u8]) -> Result<()> {
    if bytes.len() < 24 || bytes.len() > 1024 * 1024 || &bytes[..8] != b"\x89PNG\r\n\x1a\n" {
        return Err(Error::msg("Choose a valid PNG skin under 1 MiB"));
    }
    let width = u32::from_be_bytes(bytes[16..20].try_into()?);
    let height = u32::from_be_bytes(bytes[20..24].try_into()?);
    if width != 64 || ![32, 64].contains(&height) {
        return Err(Error::msg("Minecraft skins must be 64×64 or 64×32 pixels"));
    }
    let mut reader = png::Decoder::new(std::io::Cursor::new(bytes)).read_info()?;
    let size = reader.output_buffer_size();
    if size > 65536 {
        return Err(Error::msg("Unexpected skin pixel format"));
    }
    reader.next_frame(&mut vec![0; size])?;
    Ok(())
}

fn open_path(path: &std::path::Path) -> Result<()> {
    #[cfg(windows)]
    {
        std::process::Command::new("explorer.exe")
            .arg(path)
            .spawn()?;
    }
    #[cfg(not(windows))]
    {
        std::process::Command::new("xdg-open").arg(path).spawn()?;
    }
    Ok(())
}
fn open_url(url: &str) -> Result<()> {
    #[cfg(windows)]
    {
        std::process::Command::new("rundll32.exe")
            .arg("url.dll,FileProtocolHandler")
            .arg(url)
            .spawn()?;
    }
    #[cfg(not(windows))]
    {
        std::process::Command::new("xdg-open").arg(url).spawn()?;
    }
    Ok(())
}
#[cfg(feature = "desktop")]
#[tauri::command]
async fn request(
    engine: tauri::State<'_, Engine>,
    action: String,
    args: Value,
) -> std::result::Result<Value, String> {
    engine
        .dispatch(&action, args)
        .await
        .map_err(|e| e.to_string())
}
#[cfg(feature = "desktop")]
pub fn run() {
    use tauri::{Emitter, Manager};
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();
            let root = app.path().app_data_dir()?;
            let mut engine = Engine::new(
                root,
                Arc::new(move |v| {
                    let _ = handle.emit("progress", v);
                }),
            );
            let resources = app.path().resource_dir()?.join("resources");
            if resources.join("companion.json").is_file() {
                engine.companion = Some(resources);
            }
            app.manage(engine);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![request])
        .run(tauri::generate_context!())
        .expect("AR Client failed to start");
}

#[cfg(test)]
mod command_tests {
    use super::*;
    #[test]
    fn dispatch_future_is_send() {
        fn check<T: Send>(_: T) {}
        let d = tempfile::tempdir().unwrap();
        let e = engine(d.path().into());
        check(e.dispatch("state", json!({})));
    }
    fn engine(root: PathBuf) -> Engine {
        Engine::new(root, Arc::new(|_| {}))
    }
    #[tokio::test]
    async fn profiles_roundtrip_and_delete_preserves_worlds() {
        let d = tempfile::tempdir().unwrap();
        let e = engine(d.path().into());
        let p=e.dispatch("profile.save",json!({"id":"","name":"Survival","version":"1.21.9","loader":"vanilla","loaderVersion":"","ram":2048,"java":"","preset":"Custom"})).await.unwrap();
        let id = p["id"].as_str().unwrap();
        let world = d.path().join("instances").join(id).join("saves");
        std::fs::create_dir_all(&world).unwrap();
        std::fs::write(world.join("level.dat"), b"world").unwrap();
        e.dispatch("profile.delete", json!({"id":id}))
            .await
            .unwrap();
        let trash = std::fs::read_dir(d.path().join("trash"))
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        assert_eq!(
            std::fs::read(trash.join("saves/level.dat")).unwrap(),
            b"world"
        );
        assert!(state::read(d.path()).unwrap().profiles.is_empty());
    }
    #[tokio::test]
    async fn refuses_arbitrary_commands_and_missing_accounts() {
        let d = tempfile::tempdir().unwrap();
        let e = engine(d.path().into());
        assert!(e.dispatch("shell.execute", json!({})).await.is_err());
        assert!(e
            .dispatch("account.select", json!({"id":"unknown"}))
            .await
            .is_err());
    }
    #[tokio::test]
    async fn requires_explicit_eula_before_download() {
        let d = tempfile::tempdir().unwrap();
        let e = engine(d.path().into());
        let p = e
            .dispatch(
                "profile.save",
                json!({"id":"","name":"Survival","version":"1.21.9","loader":"vanilla","ram":2048}),
            )
            .await
            .unwrap();
        let err = e
            .dispatch("install", json!({"id":p["id"]}))
            .await
            .unwrap_err();
        assert!(err.to_string().contains("EULA"));
    }
    #[test]
    fn skin_dimensions_are_validated() {
        let mut image = Vec::new();
        {
            let mut encoder = png::Encoder::new(&mut image, 64, 64);
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            let mut writer = encoder.write_header().unwrap();
            writer.write_image_data(&vec![255; 64 * 64 * 4]).unwrap();
        }
        assert!(validate_skin(&image).is_ok());
        assert!(validate_skin(&image[..24]).is_err());
        image[20..24].copy_from_slice(&512u32.to_be_bytes());
        assert!(validate_skin(&image).is_err());
    }
}
