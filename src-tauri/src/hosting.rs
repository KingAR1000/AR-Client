use crate::{install, net, Error, Message, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, VecDeque},
    path::{Path, PathBuf},
    process::Stdio,
    sync::Arc,
};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{ChildStdin, Command},
    sync::Mutex,
};
#[derive(Clone, Serialize, Deserialize)]
pub struct Server {
    pub id: String,
    pub name: String,
    pub version: String,
    pub ram: u32,
    pub port: u16,
}
impl Server {
    fn validate(&self) -> Result<()> {
        uuid::Uuid::parse_str(&self.id)?;
        if self.name.trim().is_empty()
            || self.name.len() > 80
            || !(1024..=32768).contains(&self.ram)
            || self.port < 1024
        {
            return Err(Error::msg(
                "Choose a name, 1–32 GiB RAM, and a port from 1024–65535",
            ));
        }
        if self.version.is_empty()
            || !self
                .version
                .bytes()
                .all(|b| b.is_ascii_digit() || b == b'.')
        {
            return Err(Error::msg("Invalid server version"));
        }
        Ok(())
    }
}
struct Process {
    input: Option<ChildStdin>,
    lines: VecDeque<String>,
    running: bool,
    stopping: bool,
    generation: String,
}
#[derive(Clone, Default)]
pub struct Hosting {
    closing: Arc<std::sync::atomic::AtomicBool>,
    processes: Arc<Mutex<HashMap<String, Process>>>,
}
fn folder(root: &Path, id: &str) -> Result<PathBuf> {
    uuid::Uuid::parse_str(id)?;
    net::safe_path(&root.join("servers"), id)
}
fn config(root: &Path, id: &str) -> Result<Server> {
    let s: Server =
        serde_json::from_slice(&std::fs::read(folder(root, id)?.join("ar-server.json"))?)?;
    s.validate()?;
    if s.id != id {
        return Err(Error::msg("Server identity mismatch"));
    }
    Ok(s)
}
impl Hosting {
    pub async fn dispatch(
        &self,
        root: &Path,
        client: &reqwest::Client,
        action: &str,
        a: &Value,
        eula: bool,
        progress: install::Progress,
    ) -> Result<Value> {
        let id = a["id"].as_str().unwrap_or("");
        match action {
            "server.list" => {
                let mut servers = vec![];
                let dir = root.join("servers");
                if dir.exists() {
                    for entry in std::fs::read_dir(dir)? {
                        let entry = entry?;
                        let id = entry.file_name().to_string_lossy().into_owned();
                        if let Ok(s) = config(root, &id) {
                            let map = self.processes.lock().await;
                            let p = map.get(&id);
                            servers.push(json!({"config":s,"running":p.is_some_and(|p|p.running),"stopping":p.is_some_and(|p|p.stopping),"address":local_address().map(|ip|format!("{}:{}",ip,s.port))}));
                        }
                    }
                }
                Ok(json!(servers))
            }
            "server.create" => {
                let mut s: Server = serde_json::from_value(a.clone())?;
                s.id = uuid::Uuid::new_v4().to_string();
                s.validate()?;
                let versions = install::versions(client).await?;
                if !versions["versions"]
                    .as_array()
                    .is_some_and(|vs| vs.iter().any(|v| v["id"] == s.version))
                {
                    return Err(Error::msg("Choose a supported official Minecraft release"));
                }
                let dir = folder(root, &s.id)?;
                std::fs::create_dir_all(&dir)?;
                std::fs::write(dir.join("ar-server.json"), serde_json::to_vec_pretty(&s)?)?;
                // Online authentication and whitelist stay enabled; RCON is never exposed.
                std::fs::write(dir.join("server.properties"),format!("server-port={}\nonline-mode=true\nwhite-list=true\nenforce-whitelist=true\nenable-rcon=false\nenable-query=false\nmotd=AR Client server\nmax-players=10\nview-distance=8\nsimulation-distance=6\n",s.port))?;
                Ok(json!(s))
            }
            "server.logs" => {
                let _ = config(root, id)?;
                let map = self.processes.lock().await;
                Ok(json!(map
                    .get(id)
                    .map(|p| p.lines.iter().cloned().collect::<Vec<_>>())
                    .unwrap_or_default()))
            }
            "server.start" => {
                if !eula {
                    return Err(Error::msg(
                        "Read and accept Minecraft's EULA in Settings before hosting",
                    ));
                }
                let s = config(root, id)?;
                if self
                    .processes
                    .lock()
                    .await
                    .get(id)
                    .is_some_and(|p| p.running)
                {
                    return Err(Error::msg("This server is already running"));
                }
                let dir = folder(root, id)?;
                let versions = install::versions(client).await?;
                let entry = versions["versions"]
                    .as_array()
                    .and_then(|vs| vs.iter().find(|v| v["id"] == s.version))
                    .ok_or_else(|| Error::msg("Server release no longer supported"))?;
                let meta_path = dir.join("version.json");
                net::download(
                    client,
                    entry["url"].as_str().unwrap_or(""),
                    &meta_path,
                    entry["sha1"].as_str().unwrap_or(""),
                    "sha1",
                )
                .await?;
                let meta: Value = serde_json::from_slice(&std::fs::read(meta_path)?)?;
                let server = &meta["downloads"]["server"];
                progress(
                    json!({"stage":"Downloading verified Minecraft server","current":0,"total":1}),
                );
                net::download(
                    client,
                    server["url"].as_str().unwrap_or(""),
                    &dir.join("server.jar"),
                    server["sha1"].as_str().unwrap_or(""),
                    "sha1",
                )
                .await?;
                let java = install::runtime(
                    client,
                    root,
                    meta["javaVersion"]["majorVersion"].as_u64().unwrap_or(25),
                    "",
                    &progress,
                )
                .await?;
                std::fs::write(dir.join("eula.txt"), "eula=true\n")?;
                // No shell interpolation. Process survives launcher exit, preserving the server/world.
                let mut processes = self.processes.lock().await;
                if self.closing.load(std::sync::atomic::Ordering::SeqCst) {
                    return Err(Error::msg(
                        "AR Client is closing; a new server was not started",
                    ));
                }
                let mut child = Command::new(java)
                    .arg(format!("-Xmx{}M", s.ram))
                    .args(["-Xms512M", "-jar", "server.jar", "nogui"])
                    .current_dir(&dir)
                    .stdin(Stdio::piped())
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .spawn()?;
                let generation = uuid::Uuid::new_v4().to_string();
                let stdout = child.stdout.take().ok_or("Missing server output")?;
                let stderr = child.stderr.take().ok_or("Missing server errors")?;
                processes.insert(
                    id.into(),
                    Process {
                        input: child.stdin.take(),
                        lines: VecDeque::new(),
                        running: true,
                        stopping: false,
                        generation: generation.clone(),
                    },
                );
                drop(processes);
                self.read_output(id.into(), stdout);
                self.read_output(id.into(), stderr);
                let shared = self.processes.clone();
                let key = id.to_string();
                tokio::spawn(async move {
                    let result = child.wait().await;
                    let mut map = shared.lock().await;
                    if let Some(p) = map.get_mut(&key) {
                        if p.generation == generation {
                            p.running = false;
                            p.stopping = false;
                            p.input = None;
                            push_line(
                                p,
                                format!(
                                    "Server exited: {}",
                                    result
                                        .map(|s| s.to_string())
                                        .unwrap_or_else(|_| "process error".into())
                                ),
                            );
                        }
                    }
                });
                Ok(json!(true))
            }
            "server.command" | "server.stop" => {
                let _ = config(root, id)?;
                let command = if action == "server.stop" {
                    "stop"
                } else {
                    a["command"].as_str().ok_or("Missing command")?
                };
                if command.trim().is_empty()
                    || command.len() > 1024
                    || command.chars().any(|c| c.is_control())
                {
                    return Err(Error::msg(
                        "Enter one server console command, up to 1024 characters",
                    ));
                }
                let mut map = self.processes.lock().await;
                let p = map
                    .get_mut(id)
                    .filter(|p| p.running && !p.stopping)
                    .ok_or_else(|| Error::msg("Server is not running or is stopping"))?;
                let input = p.input.as_mut().ok_or("Server console closed")?;
                tokio::time::timeout(std::time::Duration::from_secs(5), async {
                    input.write_all(format!("{command}\n").as_bytes()).await?;
                    input.flush().await
                })
                .await??;
                if command == "stop" {
                    p.stopping = true;
                }
                Ok(json!(true))
            }
            "server.folder" => {
                let _ = config(root, id)?;
                crate::open_path(&folder(root, id)?)?;
                Ok(json!(true))
            }
            _ => Err(Error::msg("Unknown server action")),
        }
    }
    pub async fn shutdown(&self) -> Result<()> {
        {
            let mut map = self.processes.lock().await;
            self.closing
                .store(true, std::sync::atomic::Ordering::SeqCst);
            for process in map.values_mut().filter(|p| p.running && !p.stopping) {
                if let Some(input) = process.input.as_mut() {
                    tokio::time::timeout(std::time::Duration::from_secs(5), async {
                        input.write_all(b"stop\n").await?;
                        input.flush().await
                    })
                    .await??;
                    process.stopping = true;
                }
            }
        }
        for _ in 0..90 {
            if self.processes.lock().await.values().all(|p| !p.running) {
                return Ok(());
            }
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        }
        self.closing
            .store(false, std::sync::atomic::Ordering::SeqCst);
        Err(Error::msg("Servers are still saving. AR Client stayed open to protect their worlds. Wait and close it again."))
    }
    fn read_output<T: tokio::io::AsyncRead + Unpin + Send + 'static>(&self, id: String, stream: T) {
        let shared = self.processes.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stream).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if let Some(p) = shared.lock().await.get_mut(&id) {
                    push_line(p, line);
                }
            }
        });
    }
}
fn push_line(p: &mut Process, mut line: String) {
    if line.len() > 4096 {
        let mut i = 4096;
        while !line.is_char_boundary(i) {
            i -= 1;
        }
        line.truncate(i);
    }
    if p.lines.len() >= 300 {
        p.lines.pop_front();
    }
    p.lines.push_back(line);
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn server_validation() {
        let mut s = Server {
            id: uuid::Uuid::new_v4().to_string(),
            name: "Survival".into(),
            version: "26.3".into(),
            ram: 4096,
            port: 25565,
        };
        assert!(s.validate().is_ok());
        s.version = "../../x".into();
        assert!(s.validate().is_err());
        assert!(folder(Path::new("/tmp"), "../x").is_err());
    }
    #[tokio::test]
    async fn create_list_and_cannot_control_unknown_process() {
        let d = tempfile::tempdir().unwrap();
        let h = Hosting::default();
        let c = net::client();
        let p: install::Progress = Arc::new(|_| {});
        assert_eq!(
            h.dispatch(d.path(), &c, "server.list", &json!({}), false, p.clone())
                .await
                .unwrap(),
            json!([])
        );
        assert!(h
            .dispatch(
                d.path(),
                &c,
                "server.command",
                &json!({"id":"bad","command":"stop"}),
                false,
                p
            )
            .await
            .is_err());
    }
}

fn local_address() -> Option<std::net::Ipv4Addr> {
    let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("192.0.2.1:80").ok()?;
    match socket.local_addr().ok()?.ip() {
        std::net::IpAddr::V4(ip) if ip.is_private() => Some(ip),
        _ => None,
    }
}
