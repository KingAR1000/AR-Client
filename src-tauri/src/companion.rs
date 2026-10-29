use crate::{net, state::Profile, Error, Message, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Build {
    pub minecraft: String,
    pub loader: String,
    pub min_loader: String,
    pub fabric_api: String,
    pub filename: String,
    pub sha256: String,
}
#[derive(Deserialize)]
pub struct Manifest {
    pub format: u32,
    pub builds: Vec<Build>,
}
fn loader_version(value: &str) -> Result<Vec<u32>> {
    let parts: Vec<u32> = value
        .split('.')
        .map(str::parse)
        .collect::<std::result::Result<_, _>>()?;
    if parts.len() != 3 {
        return Err(Error::msg("Choose a stable Fabric loader version"));
    }
    Ok(parts)
}
pub fn read(resources: &Path) -> Result<Manifest> {
    let manifest: Manifest =
        serde_json::from_slice(&std::fs::read(resources.join("companion.json"))?)?;
    if manifest.format != 1 || manifest.builds.is_empty() {
        return Err(Error::msg("Unsupported AR HUD manifest"));
    }
    let mut versions = std::collections::HashSet::new();
    for build in &manifest.builds {
        if build.loader != "fabric"
            || !versions.insert(&build.minecraft)
            || build.sha256.len() != 64
            || !build.sha256.bytes().all(|c| c.is_ascii_hexdigit())
            || !build.filename.ends_with(".jar")
            || build.filename.contains('/')
            || build.filename.contains('\\')
        {
            return Err(Error::msg("Invalid AR HUD manifest entry"));
        }
        net::safe_path(&resources.join("companions"), &build.filename)?;
        loader_version(&build.min_loader)?;
    }
    Ok(manifest)
}
pub fn select<'a>(manifest: &'a Manifest, profile: &Profile) -> Result<Option<&'a Build>> {
    if profile.loader != "fabric" {
        return Ok(None);
    }
    let build = manifest
        .builds
        .iter()
        .find(|b| b.minecraft == profile.version);
    if let Some(build) = build {
        if loader_version(&profile.loader_version)? < loader_version(&build.min_loader)? {
            return Err(Error::msg(format!("AR HUD for Minecraft {} requires Fabric {} or newer. Update the loader in this installation's settings.", build.minecraft, build.min_loader)));
        }
    }
    Ok(build)
}
/// Retire only a jar whose hash matches our previous installation marker.
/// This keeps a changed profile or new game release from loading a stale HUD.
pub async fn retire(root: &Path) -> Result<()> {
    let jar = net::safe_path(root, "mods/ar-client-fabric.jar")?;
    if !jar.exists() {
        return Ok(());
    }
    let marker: Build = serde_json::from_slice(&std::fs::read(net::safe_path(root, "ar-companion.json")?)
        .map_err(|_| Error::msg("An untracked AR HUD jar is installed. Remove ar-client-fabric.jar from this installation before changing to an unsupported game version."))?)?;
    if !net::verify(&jar, &marker.sha256, "sha256").await? {
        return Err(Error::msg(
            "The installed AR HUD jar was modified. Remove it before changing game versions.",
        ));
    }
    let disabled = net::safe_path(root, "disabled-mods")?;
    std::fs::create_dir_all(&disabled)?;
    std::fs::rename(
        jar,
        disabled.join(format!("ar-client-{}.jar", uuid::Uuid::new_v4())),
    )?;
    std::fs::remove_file(net::safe_path(root, "ar-companion.json")?)?;
    Ok(())
}
pub async fn install(resources: &Path, root: &Path, build: &Build) -> Result<()> {
    let source = net::safe_path(&resources.join("companions"), &build.filename)?;
    if !net::verify(&source, &build.sha256, "sha256").await? {
        return Err(Error::msg(
            "Bundled AR HUD failed integrity verification. Repair or update AR Client.",
        ));
    }
    std::fs::create_dir_all(net::safe_path(root, "mods")?)?;
    let jar = net::safe_path(root, "mods/ar-client-fabric.jar")?;
    let temporary = net::safe_path(root, "mods/.ar-client-fabric.tmp")?;
    std::fs::copy(source, &temporary)?;
    let backup = net::safe_path(
        root,
        &format!("mods/.ar-client-fabric-{}.backup", uuid::Uuid::new_v4()),
    )?;
    if jar.exists() {
        std::fs::rename(&jar, &backup)?;
    }
    if let Err(error) = std::fs::rename(&temporary, &jar) {
        if backup.exists() {
            std::fs::rename(&backup, &jar)?;
        }
        return Err(error.into());
    }
    std::fs::write(
        net::safe_path(root, "ar-companion.json")?,
        serde_json::to_vec_pretty(build)?,
    )?;
    if backup.exists() {
        std::fs::remove_file(backup)?;
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn profile(version: &str, loader: &str) -> Profile {
        Profile {
            id: uuid::Uuid::new_v4().to_string(),
            name: "Test".into(),
            version: version.into(),
            loader: loader.into(),
            loader_version: "0.20.1".into(),
            ram: 2048,
            java: String::new(),
            preset: "Custom".into(),
        }
    }
    fn build() -> Build {
        serde_json::from_value(json!({"minecraft":"26.3","loader":"fabric","minLoader":"0.20.1","fabricApi":"0.165.0+26.3","filename":"hud.jar","sha256":"0".repeat(64)})).unwrap()
    }
    #[test]
    fn matches_exact_game_and_loader_and_checks_minimum() {
        let manifest = Manifest {
            format: 1,
            builds: vec![build()],
        };
        assert!(select(&manifest, &profile("26.3", "fabric"))
            .unwrap()
            .is_some());
        for (v, l) in [
            ("26.4", "fabric"),
            ("1.21.9", "fabric"),
            ("26.3", "forge"),
            ("26.3", "vanilla"),
        ] {
            assert!(select(&manifest, &profile(v, l)).unwrap().is_none());
        }
        let mut p = profile("26.3", "fabric");
        p.loader_version = "0.19.0".into();
        assert!(select(&manifest, &p).is_err());
        p.loader_version = "0.21.0".into();
        assert!(select(&manifest, &p).unwrap().is_some());
    }
    #[test]
    fn rejects_traversal_and_duplicate_manifest_versions() {
        let dir = tempfile::tempdir().unwrap();
        let mut bad = build();
        bad.filename = "../escape.jar".into();
        for builds in [vec![bad], vec![build(), build()]] {
            std::fs::write(
                dir.path().join("companion.json"),
                serde_json::to_vec(&json!({"format":1,"builds":builds})).unwrap(),
            )
            .unwrap();
            assert!(read(dir.path()).is_err());
        }
    }
    #[tokio::test]
    async fn rejects_tampered_bundles_and_preserves_existing_mod() {
        let resources = tempfile::tempdir().unwrap();
        let root = tempfile::tempdir().unwrap();
        std::fs::create_dir(resources.path().join("companions")).unwrap();
        std::fs::write(resources.path().join("companions/hud.jar"), b"bad").unwrap();
        std::fs::create_dir(root.path().join("mods")).unwrap();
        std::fs::write(root.path().join("mods/ar-client-fabric.jar"), b"existing").unwrap();
        assert!(install(resources.path(), root.path(), &build())
            .await
            .is_err());
        assert_eq!(
            std::fs::read(root.path().join("mods/ar-client-fabric.jar")).unwrap(),
            b"existing"
        );
    }
    #[tokio::test]
    async fn retires_managed_old_jar_but_refuses_modified_files() {
        use sha2::{Digest, Sha256};
        let root = tempfile::tempdir().unwrap();
        std::fs::create_dir(root.path().join("mods")).unwrap();
        let mut b = build();
        b.sha256 = hex::encode(Sha256::digest(b"managed"));
        std::fs::write(
            root.path().join("ar-companion.json"),
            serde_json::to_vec(&b).unwrap(),
        )
        .unwrap();
        std::fs::write(root.path().join("mods/ar-client-fabric.jar"), b"changed").unwrap();
        assert!(retire(root.path()).await.is_err());
        std::fs::write(root.path().join("mods/ar-client-fabric.jar"), b"managed").unwrap();
        retire(root.path()).await.unwrap();
        assert!(!root.path().join("mods/ar-client-fabric.jar").exists());
        assert_eq!(
            std::fs::read_dir(root.path().join("disabled-mods"))
                .unwrap()
                .count(),
            1
        );
    }
}
