//! Third-party Horizon integration using its signed Nightly artifacts and Launch API 0.1.
use crate::{
    install, net,
    state::{Account, Profile},
    Error, Message, Result,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use futures_util::StreamExt;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    path::{Path, PathBuf},
    process::Stdio,
};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, Command},
};
const KEY: &str = "MU4oiIQcCxkZvbwSjjXs7SySCuM6ywRQ3nGaJYZG0gw=";
fn verify_sums(sums: &[u8], signature: &str, asset: &str) -> Result<String> {
    let mut message = b"horizon release nightly\n".to_vec();
    message.extend(sums);
    let key = STANDARD.decode(KEY)?;
    let verifier = ring::signature::UnparsedPublicKey::new(&ring::signature::ED25519, key);
    if !signature
        .lines()
        .filter_map(|s| STANDARD.decode(s.trim()).ok())
        .any(|sig| verifier.verify(&message, &sig).is_ok())
    {
        return Err(Error::msg(
            "Horizon release signature is invalid. Download refused.",
        ));
    }
    let entries: Vec<_> = std::str::from_utf8(sums)?
        .lines()
        .filter_map(|line| line.split_once("  "))
        .filter(|(_, name)| *name == asset)
        .collect();
    if entries.len() != 1 {
        return Err(Error::msg("Horizon checksum missing or ambiguous"));
    }
    let hash = entries[0].0;
    if hash.len() != 64 || !hash.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(Error::msg("Invalid Horizon checksum"));
    }
    Ok(hash.into())
}
fn installed_hashes(archive: &Path, asset: &str) -> Result<Vec<(String, String)>> {
    fn digest(reader: &mut impl std::io::Read) -> Result<String> {
        let mut sha = Sha256::new();
        let mut buffer = [0; 65536];
        loop {
            let n = reader.read(&mut buffer)?;
            if n == 0 {
                break;
            }
            sha.update(&buffer[..n]);
        }
        Ok(hex::encode(sha.finalize()))
    }
    fn program(name: &str) -> bool {
        matches!(
            name.rsplit('/').next(),
            Some(
                "horizon-client" | "horizon-client.exe" | "horizon-prepare" | "horizon-prepare.exe"
            )
        )
    }
    let mut values = vec![];
    if asset.ends_with(".zip") {
        let mut zip = zip::ZipArchive::new(std::fs::File::open(archive)?)?;
        for i in 0..zip.len() {
            let mut entry = zip.by_index(i)?;
            let name = entry.name().to_string();
            if program(&name) {
                values.push((name, digest(&mut entry)?));
            }
        }
    } else {
        let mut tar =
            tar::Archive::new(flate2::read::GzDecoder::new(std::fs::File::open(archive)?));
        for entry in tar.entries()? {
            let mut entry = entry?;
            let name = entry
                .path()?
                .to_string_lossy()
                .trim_start_matches("./")
                .to_string();
            if program(&name) {
                values.push((name, digest(&mut entry)?));
            }
        }
    }
    if values.len() != 2 {
        return Err(Error::msg(
            "Horizon archive has an ambiguous executable layout",
        ));
    }
    Ok(values)
}
async fn small(c: &reqwest::Client, url: &str) -> Result<Vec<u8>> {
    let mut stream = c
        .get(net::https(url)?)
        .send()
        .await?
        .error_for_status()?
        .bytes_stream();
    let mut bytes = vec![];
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        if bytes.len() + chunk.len() > 65536 {
            return Err(Error::msg("Horizon metadata too large"));
        }
        bytes.extend(chunk);
    }
    Ok(bytes)
}
fn executable(dir: &Path, name: &str) -> Result<PathBuf> {
    let filename = if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.into()
    };
    let direct = dir.join(&filename);
    if direct.is_file() {
        return Ok(direct);
    }
    for e in std::fs::read_dir(dir)? {
        let e = e?;
        if e.file_type()?.is_dir() {
            let p = e.path().join(&filename);
            if p.is_file() {
                return Ok(p);
            }
        }
    }
    Err(Error::msg(format!("Horizon archive is missing {filename}")))
}
async fn api(exe: &Path) -> Result<Value> {
    let out = tokio::time::timeout(
        std::time::Duration::from_secs(20),
        Command::new(exe)
            .arg("--launch-api")
            .kill_on_drop(true)
            .output(),
    )
    .await??;
    if !out.status.success() {
        return Err(Error::msg(
            "This Horizon build cannot report its Launch API. It was not started.",
        ));
    }
    let value: Value = serde_json::from_slice(&out.stdout)?;
    if !value["launch_api"]
        .as_str()
        .is_some_and(|s| s.starts_with("0.1."))
    {
        return Err(Error::msg(
            "Unsupported Horizon Launch API. Update AR Client.",
        ));
    }
    Ok(value)
}
// Published Nightlies currently predate the preparer --launch-api flag. Verify
// their actual help output and signed research-lock instead of assuming support.
async fn preparer_contract(exe: &Path) -> Result<Value> {
    if let Ok(value) = api(exe).await {
        return Ok(value);
    }
    let output = Command::new(exe)
        .arg("--help")
        .kill_on_drop(true)
        .output()
        .await?;
    if !output.status.success() {
        return Err(Error::msg(
            "Horizon preparer does not support a known command contract",
        ));
    }
    let help = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let lock: Value = serde_json::from_slice(&std::fs::read(
        exe.parent()
            .ok_or("Preparer directory missing")?
            .join("research-lock.json"),
    )?)?;
    let names = [
        "--output",
        "--check",
        "--complete",
        "--progress",
        "--minecraft-dir",
        "--server-jar",
        "--java-home",
    ];
    if names.iter().any(|name| {
        !help
            .split_whitespace()
            .any(|word| word.trim_matches(['[', ']', '(', ')', ',']) == *name)
    }) {
        return Err(Error::msg("Horizon preparer has incompatible options"));
    }
    Ok(
        json!({"minecraft":lock["minecraft"]["version"],"java_major":lock["minecraft"]["java_major"],"options":names.iter().map(|name|json!({"name":name})).collect::<Vec<_>>()}),
    )
}
fn options(api: &Value, required: &[&str]) -> Result<()> {
    for name in required {
        if !api["options"]
            .as_array()
            .is_some_and(|opts| opts.iter().any(|o| o["name"] == *name))
        {
            return Err(Error::msg(format!(
                "Horizon does not support required option {name}"
            )));
        }
    }
    Ok(())
}
pub async fn inspect(dir: &Path) -> Result<Value> {
    let client = api(&executable(dir, "horizon-client")?).await?;
    let preparer = preparer_contract(&executable(dir, "horizon-prepare")?).await?;
    options(
        &client,
        &["--resources", "--game-dir", "--home", "--session-stdin"],
    )?;
    options(
        &preparer,
        &[
            "--output",
            "--check",
            "--complete",
            "--progress",
            "--minecraft-dir",
            "--server-jar",
            "--java-home",
        ],
    )?;
    if client["minecraft"] != "26.3"
        || preparer["minecraft"] != "26.3"
        || preparer["java_major"] != 25
    {
        return Err(Error::msg(
            "Horizon requires an unsupported game or Java version",
        ));
    }
    Ok(json!({"client":client,"preparer":preparer}))
}
pub async fn prepare(
    c: &reqwest::Client,
    root: &Path,
    p: &Profile,
    progress: install::Progress,
) -> Result<(PathBuf, PathBuf)> {
    if p.version != "26.3" {
        return Err(Error::msg("Horizon currently requires a 26.3 installation. Java mods and AR's Fabric HUD do not run in Horizon."));
    }
    let asset = if cfg!(all(windows, target_arch = "x86_64")) {
        "horizon-windows-x64.zip"
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        "horizon-linux-x86_64.tar.gz"
    } else {
        return Err(Error::msg(
            "Horizon integration supports Windows x64 and Linux x86_64",
        ));
    };
    progress(json!({"stage":"Verifying Horizon's signed Nightly release","current":0,"total":1}));
    let release = net::json(
        c,
        "https://api.github.com/repos/horizon-rust/horizon/releases/tags/nightly",
    )
    .await?;
    if !release["assets"]
        .as_array()
        .is_some_and(|assets| assets.iter().any(|a| a["name"] == asset))
    {
        return Err(Error::msg("Horizon has no compatible download"));
    }
    let base = "https://github.com/horizon-rust/horizon/releases/download/nightly";
    let sums = small(c, &format!("{base}/SHA256SUMS")).await?;
    let sig = small(c, &format!("{base}/SHA256SUMS.sig")).await?;
    let digest = verify_sums(&sums, std::str::from_utf8(&sig)?, asset)?;
    let builds = root.join("horizon/builds");
    let dir = builds.join(&digest);
    let archive = root.join("horizon").join(asset);
    net::download(c, &format!("{base}/{asset}"), &archive, &digest, "sha256").await?;
    if !dir.join("ar-complete.json").exists() {
        std::fs::create_dir_all(&builds)?;
        let staging = builds.join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&staging)?;
        let unpack: Result<()> = (|| {
            if asset.ends_with(".zip") {
                net::unzip(&archive, &staging, false)?;
            } else {
                let mut tar =
                    tar::Archive::new(flate2::read::GzDecoder::new(std::fs::File::open(&archive)?));
                let mut total = 0;
                for entry in tar.entries()? {
                    let mut entry = entry?;
                    let path = entry
                        .path()?
                        .to_string_lossy()
                        .trim_start_matches("./")
                        .to_string();
                    if path.is_empty() {
                        continue;
                    }
                    total += entry.size();
                    if total > 2 * 1024 * 1024 * 1024 {
                        return Err(Error::msg("Horizon archive too large"));
                    }
                    let kind = entry.header().entry_type();
                    if !kind.is_file() && !kind.is_dir() {
                        return Err(Error::msg(
                            "Horizon archive contains a link or special file",
                        ));
                    }
                    let dest = net::safe_path(&staging, &path)?;
                    if kind.is_dir() {
                        std::fs::create_dir_all(dest)?;
                    } else {
                        std::fs::create_dir_all(dest.parent().unwrap())?;
                        std::io::copy(&mut entry, &mut std::fs::File::create(&dest)?)?;
                        #[cfg(unix)]
                        {
                            use std::os::unix::fs::PermissionsExt;
                            std::fs::set_permissions(
                                dest,
                                std::fs::Permissions::from_mode(entry.header().mode()? & 0o777),
                            )?;
                        }
                    }
                }
            }
            executable(&staging, "horizon-client")?;
            executable(&staging, "horizon-prepare")?;
            std::fs::write(
                staging.join("ar-complete.json"),
                serde_json::to_vec(
                    &json!({"sha256":digest,"source":"horizon-rust/horizon","channel":"nightly"}),
                )?,
            )?;
            if dir.exists() {
                std::fs::remove_dir_all(&dir)?;
            }
            std::fs::rename(&staging, &dir)?;
            Ok(())
        })();
        if unpack.is_err() {
            let _ = std::fs::remove_dir_all(staging);
        }
        unpack?;
    }
    for (name, hash) in installed_hashes(&archive, asset)? {
        let path = net::safe_path(&dir, &name)?;
        if !net::verify(&path, &hash, "sha256").await? {
            return Err(Error::msg("Installed Horizon executable differs from the signed archive. Remove this Horizon build directory and install it again."));
        }
    }
    let client = executable(&dir, "horizon-client")?;
    let preparer = executable(&dir, "horizon-prepare")?;
    inspect(&dir).await?;
    let prepared = root.join("horizon/prepared").join(&digest);
    let check = Command::new(&preparer)
        .arg("--check")
        .arg("--output")
        .arg(&prepared)
        .current_dir(preparer.parent().unwrap())
        .kill_on_drop(true)
        .output()
        .await?;
    if !check.status.success() {
        let mut vanilla = p.clone();
        vanilla.loader = "vanilla".into();
        vanilla.loader_version = String::new();
        let inst =
            install::install(c, &root.join("horizon-support"), &vanilla, progress.clone()).await?;
        let meta = &inst.metadata;
        let server = &meta["downloads"]["server"];
        let jar = inst.root.join("server.jar");
        net::download(
            c,
            server["url"].as_str().unwrap_or(""),
            &jar,
            server["sha1"].as_str().unwrap_or(""),
            "sha1",
        )
        .await?;
        let java_home = inst
            .java
            .parent()
            .and_then(|p| p.parent())
            .ok_or("Java home missing")?;
        let mut child = Command::new(&preparer)
            .args(["--prepare", "--complete", "--progress", "json"])
            .arg("--minecraft-dir")
            .arg(&inst.root)
            .arg("--server-jar")
            .arg(jar)
            .arg("--java-home")
            .arg(java_home)
            .arg("--output")
            .arg(&prepared)
            .current_dir(preparer.parent().unwrap())
            .stdout(Stdio::piped())
            .stderr(Stdio::from(std::fs::File::create(
                root.join("horizon/prepare-errors.log"),
            )?))
            .kill_on_drop(true)
            .spawn()?;
        let mut lines =
            BufReader::new(child.stdout.take().ok_or("Preparer output missing")?).lines();
        while let Some(line) = lines.next_line().await? {
            if let Ok(v) = serde_json::from_str::<Value>(&line) {
                let fraction = v["fraction"].as_f64().unwrap_or(0.0).clamp(0.0, 1.0);
                progress(
                    json!({"stage":v["message"].as_str().unwrap_or("Preparing Horizon resources from your Minecraft copy"),"current":(fraction*100.0)as u64,"total":100}),
                );
            }
        }
        if !child.wait().await?.success() {
            return Err(Error::msg("Horizon resource preparation failed. See horizon/prepare-errors.log in the data folder."));
        }
        if !Command::new(&preparer)
            .arg("--check")
            .arg("--output")
            .arg(&prepared)
            .current_dir(preparer.parent().unwrap())
            .output()
            .await?
            .status
            .success()
        {
            return Err(Error::msg(
                "Horizon preparation is incomplete; launch refused",
            ));
        }
    }
    Ok((client, prepared))
}
pub async fn launch(
    exe: &Path,
    prepared: &Path,
    root: &Path,
    p: &Profile,
    a: &Account,
    token: &str,
) -> Result<Child> {
    let game = net::safe_path(&root.join("rust-instances"), &p.id)?;
    std::fs::create_dir_all(&game)?;
    let log = std::fs::File::create(game.join("horizon-output.log"))?;
    let mut child = Command::new(exe)
        .arg("--resources")
        .arg(prepared)
        .arg("--game-dir")
        .arg(&game)
        .arg("--home")
        .arg(&game)
        .arg("--session-stdin")
        .env("HORIZON_MEMORY_LIMIT_MB", p.ram.to_string())
        .env("HORIZON_NO_DISCORD", "1")
        .current_dir(exe.parent().unwrap())
        .stdin(Stdio::piped())
        .stdout(Stdio::from(log.try_clone()?))
        .stderr(Stdio::from(log))
        .spawn()?;
    let mut input = child.stdin.take().ok_or("Horizon session input missing")?;
    let session = serde_json::to_vec(
        &json!({"name":a.name,"uuid":a.id,"access_token":token,"user_type":"msa"}),
    )?;
    if let Err(error) = input.write_all(&session).await {
        let _ = child.kill().await;
        return Err(error.into());
    }
    input.shutdown().await?;
    drop(input);
    Ok(child)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_real_signed_release_and_rejects_tampering() {
        let sums = include_bytes!("../tests/fixtures/horizon-nightly.SHA256SUMS");
        let sig = include_str!("../tests/fixtures/horizon-nightly.sig");
        assert_eq!(
            verify_sums(sums, sig, "horizon-linux-x86_64.tar.gz").unwrap(),
            "9670e16918da160db34da720268681c77a46ffe68afd445968b919db6e61f9ea"
        );
        let mut changed = sums.to_vec();
        changed[0] ^= 1;
        assert!(verify_sums(&changed, sig, "horizon-linux-x86_64.tar.gz").is_err());
        assert!(verify_sums(sums, sig, "unlisted.exe").is_err());
    }
    #[test]
    fn rejects_unsigned_or_wrong_tag_checksums() {
        assert!(verify_sums(b"fake", "bad", "horizon-windows-x64.zip").is_err());
    }
    #[test]
    fn api_options_fail_closed() {
        assert!(options(
            &json!({"options":[{"name":"--resources"}]}),
            &["--session-stdin"]
        )
        .is_err());
    }
}
