use crate::Message;
use futures_util::StreamExt;
use serde_json::Value;
use sha1::{Digest, Sha1};
use sha2::Sha256;
use std::{path::{Component, Path, PathBuf}, time::Duration};
use tokio::io::AsyncWriteExt;
use crate::{Error, Result};

pub fn client() -> reqwest::Client {
    reqwest::Client::builder().user_agent("ARClient/0.1.0 (KingAR1000/AR-Client)")
        .connect_timeout(Duration::from_secs(20)).timeout(Duration::from_secs(300))
        .redirect(reqwest::redirect::Policy::custom(|a| {
            if a.previous().len() > 5 || a.url().scheme() != "https" { a.stop() } else { a.follow() }
        })).build().expect("HTTP client")
}
pub fn safe_path(root: &Path, relative: &str) -> Result<PathBuf> {
    if relative.is_empty() || relative.contains('\\') || relative.contains(':') || relative.as_bytes().contains(&0) {
        return Err(Error::msg("Unsafe file path"));
    }
    let p = Path::new(relative);
    if p.components().any(|c| !matches!(c, Component::Normal(_))) { return Err(Error::msg("Unsafe file path")); }
    let mut current = root.to_path_buf();
    for part in p.components() {
        current.push(part);
        if std::fs::symlink_metadata(&current).is_ok_and(|m| m.file_type().is_symlink()) { return Err(Error::msg("Symbolic links are not allowed in managed paths")); }
    }
    Ok(current)
}
pub fn https(url: &str) -> Result<url::Url> {
    let u = url::Url::parse(url)?;
    if u.scheme() != "https" || u.host_str().is_none() || !u.username().is_empty() || u.password().is_some() { return Err(Error::msg("Only HTTPS downloads are allowed")); }
    Ok(u)
}
pub async fn json(client: &reqwest::Client, url: &str) -> Result<Value> {
    let r = client.get(https(url)?).send().await?.error_for_status()?;
    if r.content_length().unwrap_or(0) > 32 * 1024 * 1024 { return Err(Error::msg("Metadata exceeds size limit")); }
    let bytes = r.bytes().await?;
    if bytes.len() > 32 * 1024 * 1024 { return Err(Error::msg("Metadata exceeds size limit")); }
    Ok(serde_json::from_slice(&bytes)?)
}
pub async fn download(client: &reqwest::Client, url: &str, dest: &Path, hash: &str, algorithm: &str) -> Result<()> {
    if !matches!(algorithm, "sha1" | "sha256" | "sha512") || hash.is_empty() { return Err(Error::msg("A trusted checksum is required for every download")); }
    if dest.is_file() && verify(dest, hash, algorithm).await? { return Ok(()); }
    tokio::fs::create_dir_all(dest.parent().ok_or_else(||Error::msg("Invalid destination"))?).await?;
    let temp = dest.with_extension(format!("{}.part", uuid::Uuid::new_v4()));
    let result: Result<()> = async {
        let mut response = client.get(https(url)?).send().await?.error_for_status()?.bytes_stream();
        let mut file = tokio::fs::File::create(&temp).await?;
        let mut total = 0u64;
        while let Some(chunk) = response.next().await {
            let chunk = chunk?; total += chunk.len() as u64;
            if total > 4 * 1024 * 1024 * 1024 { return Err(Error::msg("Download exceeds 4 GiB limit")); }
            file.write_all(&chunk).await?;
        }
        file.flush().await?; drop(file);
        if !verify(&temp, hash, algorithm).await? { return Err(Error::msg("Download checksum mismatch; file rejected")); }
        if dest.exists() { tokio::fs::remove_file(dest).await?; }
        tokio::fs::rename(&temp, dest).await?;
        Ok(())
    }.await;
    if result.is_err() { let _ = tokio::fs::remove_file(&temp).await; }
    result
}
pub async fn verify(path: &Path, expected: &str, algorithm: &str) -> Result<bool> {
    use tokio::io::AsyncReadExt;
    let mut file = tokio::fs::File::open(path).await?;
    let mut buffer = vec![0u8; 65536];
    let mut h1 = Sha1::new(); let mut h256 = Sha256::new(); let mut h512 = sha2::Sha512::new();
    loop { let n = file.read(&mut buffer).await?; if n == 0 { break; }
        match algorithm { "sha1" => h1.update(&buffer[..n]), "sha256" => h256.update(&buffer[..n]), "sha512" => h512.update(&buffer[..n]), _ => return Err(Error::msg("Unsupported checksum")) }
    }
    let hash = match algorithm { "sha1"=>hex::encode(h1.finalize()), "sha256"=>hex::encode(h256.finalize()), _=>hex::encode(h512.finalize()) };
    Ok(hash.eq_ignore_ascii_case(expected))
}
pub fn unzip(archive: &Path, destination: &Path, native: bool) -> Result<()> {
    let mut zip = zip::ZipArchive::new(std::fs::File::open(archive)?)?;
    let mut expanded = 0u64;
    for i in 0..zip.len() {
        let mut file = zip.by_index(i)?;
        expanded += file.size();
        if expanded > 4 * 1024 * 1024 * 1024 { return Err(Error::msg("Archive exceeds extraction limit")); }
        if native && file.name().starts_with("META-INF/") { continue; }
        if file.unix_mode().is_some_and(|m| m & 0o170000 == 0o120000) { return Err(Error::msg("Archive contains a symbolic link")); }
        let target = safe_path(destination, file.name().trim_end_matches('/'))?;
        if file.is_dir() { std::fs::create_dir_all(target)?; } else {
            std::fs::create_dir_all(target.parent().unwrap())?;
            std::io::copy(&mut file, &mut std::fs::File::create(&target)?)?;
            #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; if let Some(mode) = file.unix_mode() { std::fs::set_permissions(target, std::fs::Permissions::from_mode(mode & 0o777))?; } }
        }
    } Ok(())
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn rejects_traversal_and_drive_paths() { for p in ["../secret", "/etc/passwd", "C:/secret", "x\\..\\y", "a/../../b", ""] { assert!(safe_path(Path::new("/tmp/root"), p).is_err(), "{p}"); } assert!(safe_path(Path::new("/tmp"), "mods/a.jar").is_ok()); }
    #[test] fn rejects_plain_http() { assert!(https("http://example.com").is_err()); assert!(https("https://user:pass@example.com").is_err()); }
    #[tokio::test] async fn verifies_content() { let dir=tempfile::tempdir().unwrap(); let p=dir.path().join("file"); tokio::fs::write(&p,b"abc").await.unwrap(); assert!(verify(&p,"a9993e364706816aba3e25717850c26c9cd0d89d","sha1").await.unwrap()); assert!(!verify(&p,"0000","sha1").await.unwrap()); }
}
