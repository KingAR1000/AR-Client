use crate::Message;
use crate::{
    install::{urlencoding, Progress},
    net,
    state::{self, Profile},
    Error, Result,
};
use serde_json::{json, Value};
use std::{collections::HashSet, path::Path};
const MR: &str = "https://api.modrinth.com/v2";
async fn cf(c: &reqwest::Client, path: &str) -> Result<Value> {
    let request = if let Ok(key) = state::secret_get("curseforge") {
        c.get(format!("https://api.curseforge.com/v1/{path}"))
            .header("x-api-key", key)
    } else {
        // The project key stays in Vercel's server environment, never in binaries.
        // Personal keys remain an optional direct-to-CurseForge override.
        let (route, query) = path.split_once('?').unwrap_or((path, ""));
        let url = format!(
            "https://client.kingar1000.xyz/api/curseforge?path={}&{query}",
            urlencoding(route)
        );
        c.get(url)
    };
    let response = request.send().await?;
    if !response.status().is_success() {
        return Err(Error::msg(match response.status().as_u16() {
            401 | 403 => "CurseForge rejected the configured key. Update your personal key in Settings or contact AR Client support.",
            429 => "CurseForge request limit reached. Try again shortly.",
            404 | 503 => "The AR Client CurseForge service is not available yet. Modrinth works now; a personal CurseForge key can be saved in Settings.",
            _ => "The CurseForge catalog is temporarily unavailable. Try again shortly.",
        }));
    }
    let payload: Value = response.json().await?;
    payload
        .get("data")
        .cloned()
        .ok_or_else(|| Error::msg("Invalid CurseForge catalog response"))
}
pub async fn search(
    c: &reqwest::Client,
    source: &str,
    kind: &str,
    query: &str,
    p: &Profile,
    offset: u64,
) -> Result<Value> {
    if source == "curseforge" {
        let class = match kind {
            "mod" => 6,
            "resourcepack" => 12,
            "modpack" => 4471,
            _ => return Err(Error::msg("Invalid project type")),
        };
        let v=cf(c,&format!("mods/search?gameId=432&classId={class}&gameVersion={}&searchFilter={}&index={offset}&pageSize=20",urlencoding(&p.version),urlencoding(query))).await?;
        return Ok(
            json!({"hits":v.as_array().into_iter().flatten().map(|x|json!({"project_id":x["id"].to_string(),"title":x["name"],"description":x["summary"],"icon_url":x["logo"]["thumbnailUrl"],"downloads":x["downloadCount"],"author":x["authors"][0]["name"]})).collect::<Vec<_>>() }),
        );
    }
    if source != "modrinth" {
        return Err(Error::msg("Unknown catalog"));
    }
    let mut facets = vec![
        vec![format!("project_type:{kind}")],
        vec![format!("versions:{}", p.version)],
    ];
    if kind == "mod" && p.loader != "vanilla" {
        facets.push(vec![format!("categories:{}", p.loader)]);
    }
    net::json(
        c,
        &format!(
            "{MR}/search?query={}&facets={}&limit=20&offset={offset}",
            urlencoding(query),
            urlencoding(&serde_json::to_string(&facets)?)
        ),
    )
    .await
}
pub async fn project_versions(
    c: &reqwest::Client,
    source: &str,
    id: &str,
    p: &Profile,
    kind: &str,
) -> Result<Value> {
    if !["modrinth", "curseforge"].contains(&source) {
        return Err(Error::msg("Unknown catalog"));
    }
    if source == "curseforge" {
        return cf(
            c,
            &format!(
                "mods/{}/files?gameVersion={}&modLoaderType={}",
                urlencoding(id),
                urlencoding(&p.version),
                match p.loader.as_str() {
                    "forge" => 1,
                    "fabric" => 4,
                    "quilt" => 5,
                    "neoforge" => 6,
                    _ => 0,
                }
            ),
        )
        .await;
    }
    let filter = if kind == "mod" {
        format!("&loaders={}", urlencoding(&json!([p.loader]).to_string()))
    } else {
        String::new()
    };
    net::json(
        c,
        &format!(
            "{MR}/project/{}/version?game_versions={}{}",
            urlencoding(id),
            urlencoding(&json!([p.version]).to_string()),
            filter
        ),
    )
    .await
}
pub fn read_lock(root: &Path) -> Result<Vec<Value>> {
    let path = root.join("ar-content.json");
    if !path.exists() {
        return Ok(vec![]);
    }
    Ok(serde_json::from_slice(&std::fs::read(path)?)?)
}
pub fn list_content(root: &Path) -> Result<Vec<Value>> {
    let mut entries = read_lock(root)?;
    for (folder, kind, extension) in [
        ("mods", "mod", "jar"),
        ("resourcepacks", "resourcepack", "zip"),
    ] {
        let dir = root.join(folder);
        if !dir.exists() {
            continue;
        }
        for item in std::fs::read_dir(dir)? {
            let item = item?;
            let name = item.file_name().to_string_lossy().into_owned();
            if item.file_type()?.is_file()
                && item.path().extension().is_some_and(|s| s == extension)
                && !entries.iter().any(|x| x["filename"] == name)
            {
                entries.push(json!({"filename":name,"source":"local","projectId":"","versionId":"User imported / untracked","kind":kind}));
            }
        }
    }
    Ok(entries)
}
fn write_lock(root: &Path, lock: &[Value]) -> Result<()> {
    std::fs::write(
        root.join("ar-content.json"),
        serde_json::to_vec_pretty(lock)?,
    )?;
    Ok(())
}
pub async fn install(
    c: &reqwest::Client,
    root: &Path,
    p: &Profile,
    source: &str,
    id: &str,
    kind: &str,
    progress: Progress,
) -> Result<Value> {
    if kind == "mod" && p.loader == "vanilla" {
        return Err(Error::msg(
            "Choose a modloader installation before adding mods",
        ));
    }
    if !["mod", "resourcepack", "modpack"].contains(&kind) {
        return Err(Error::msg("Invalid content type"));
    }
    std::fs::create_dir_all(root)?;
    let mut pending = vec![(id.to_string(), None::<String>)];
    let mut selected = std::collections::BTreeMap::<String, Value>::new();
    let mut pins = std::collections::HashMap::<String, String>::new();
    let mut visited = HashSet::<String>::new();
    while let Some((project, exact)) = pending.pop() {
        let request_key = format!("{project}:{}", exact.as_deref().unwrap_or("latest"));
        if !visited.insert(request_key) {
            continue;
        }
        if visited.len() > 512 {
            return Err(Error::msg("Dependency graph exceeds safety limit"));
        }
        let version = if let Some(ref exact) = exact {
            net::json(c, &format!("{MR}/version/{}", urlencoding(exact))).await?
        } else {
            project_versions(c, source, &project, p, kind)
                .await?
                .as_array()
                .and_then(|v| v.first())
                .cloned()
                .ok_or_else(|| Error::msg(format!("No compatible release for project {project}")))?
        };
        let canonical = if source == "modrinth" {
            version["project_id"]
                .as_str()
                .ok_or_else(|| Error::msg("Missing project identity"))?
                .to_string()
        } else {
            version["modId"].to_string()
        };
        if source == "modrinth" && kind == "mod" && !compatible(&version, p) {
            return Err(Error::msg(
                "Required mod version is incompatible with this installation",
            ));
        }
        let version_id = if source == "modrinth" {
            version["id"].as_str().unwrap_or("").to_string()
        } else {
            version["id"].to_string()
        };
        if exact.is_some() {
            if pins.get(&canonical).is_some_and(|pin| pin != &version_id) {
                return Err(Error::msg(
                    "Dependencies require conflicting versions of the same project",
                ));
            }
            pins.insert(canonical.clone(), version_id.clone());
        } else if pins.contains_key(&canonical) {
            continue;
        }
        if selected
            .get(&canonical)
            .is_some_and(|v| v["id"] == version["id"])
        {
            continue;
        }
        for dep in version["dependencies"].as_array().into_iter().flatten() {
            if source == "modrinth" && dep["dependency_type"] == "required" {
                let project_id = dep["project_id"].as_str().unwrap_or("").to_string();
                let exact = dep["version_id"].as_str().map(str::to_owned);
                if project_id.is_empty() && exact.is_none() {
                    return Err(Error::msg(
                        "Required file-only dependency has no verifiable project or version",
                    ));
                }
                pending.push((project_id, exact));
            } else if source == "curseforge" && dep["relationType"] == 3 {
                pending.push((dep["modId"].to_string(), None));
            }
        }
        selected.insert(canonical, version);
    }
    let plan: Vec<(String, Value)> = selected.into_iter().collect();
    let lock = read_lock(root)?;
    for (_, v) in &plan {
        for dep in v["dependencies"].as_array().into_iter().flatten() {
            if dep["dependency_type"] == "incompatible" {
                if let Some(id) = dep["project_id"].as_str() {
                    if lock.iter().any(|x| x["projectId"] == id)
                        || plan.iter().any(|(pid, _)| pid == id)
                    {
                        return Err(Error::msg(
                            "An incompatible mod is already installed or required",
                        ));
                    }
                }
            }
        }
    }
    let staging = root.join(format!(".staging-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&staging)?;
    let mut records = vec![];
    let result:Result<()>=async{
        for (i,(project,v)) in plan.iter().enumerate(){
            progress(json!({"stage":"Downloading content and dependencies","current":i,"total":plan.len()}));
            let (filename,url,hash,algorithm,version)=if source=="modrinth"{
                let file=v["files"].as_array().and_then(|a|a.iter().find(|x|x["primary"]==true).or(a.first())).ok_or_else(||Error::msg("No downloadable file"))?;
                (file["filename"].as_str().unwrap_or(""),file["url"].as_str().unwrap_or(""),file["hashes"]["sha512"].as_str().unwrap_or(""),"sha512",v["id"].as_str().unwrap_or("").to_owned())
            }else{
                let hash=v["hashes"].as_array().and_then(|a|a.iter().find(|x|x["algo"]==1)).and_then(|x|x["value"].as_str()).unwrap_or("");
                (v["fileName"].as_str().unwrap_or(""),v["downloadUrl"].as_str().ok_or_else(||Error::msg("The author has disabled third-party downloads for this CurseForge file."))?,hash,"sha1",v["id"].to_string())
            };
            if filename.contains('/') || !filename.ends_with(if kind=="mod"{".jar"}else if kind=="modpack" && source=="modrinth"{".mrpack"}else{".zip"}){return Err(Error::msg("Unexpected content filename"));}
            let path=net::safe_path(&staging,filename)?;net::download(c,url,&path,hash,algorithm).await?;
            records.push(json!({"source":source,"projectId":project,"versionId":version,"filename":filename,"kind":kind,"hash":hash,"algorithm":algorithm,"dependencies":v["dependencies"]}));
        }Ok(())
    }.await;
    if let Err(e) = result {
        let _ = std::fs::remove_dir_all(&staging);
        return Err(e);
    }
    if kind == "modpack" {
        for record in &records {
            import_pack(
                c,
                root,
                p,
                &staging.join(record["filename"].as_str().unwrap()),
                source,
                &progress,
            )
            .await?;
        }
    } else {
        commit_content(root, &staging, &records, &lock)?;
    }
    std::fs::remove_dir_all(staging)?;
    Ok(json!(records))
}

fn commit_content(root: &Path, staging: &Path, records: &[Value], old: &[Value]) -> Result<()> {
    let mut updated = old.to_vec();
    let mut targets = HashSet::new();
    let mut replacements = Vec::new();
    let mut removals = HashSet::new();
    for record in records {
        let name = record["filename"]
            .as_str()
            .ok_or_else(|| Error::msg("Missing content filename"))?;
        let folder = if record["kind"] == "mod" {
            "mods"
        } else {
            "resourcepacks"
        };
        let relative = format!("{folder}/{name}");
        let dest = net::safe_path(root, &relative)?;
        if !targets.insert(relative.clone()) {
            return Err(Error::msg("Two projects use the same filename"));
        }
        if dest.exists()
            && !old.iter().any(|x| {
                x["filename"] == name
                    && x["projectId"] == record["projectId"]
                    && x["source"] == record["source"]
            })
        {
            return Err(Error::msg(
                "An unmanaged file has the same name; refusing to overwrite it",
            ));
        }
        for previous in old
            .iter()
            .filter(|x| x["projectId"] == record["projectId"] && x["source"] == record["source"])
        {
            let previous = previous["filename"]
                .as_str()
                .ok_or_else(|| Error::msg("Invalid content lock"))?;
            removals.insert(format!("{folder}/{previous}"));
        }
        replacements.push((staging.join(name), dest, relative));
        updated.retain(|x| {
            !(x["projectId"] == record["projectId"] && x["source"] == record["source"])
        });
        updated.push(record.clone());
    }
    let backup = staging.join("backup");
    let mut backed_up = vec![];
    let mut installed = vec![];
    let result: Result<()> = (|| {
        for relative in removals {
            let dest = net::safe_path(root, &relative)?;
            if dest.exists() {
                let saved = net::safe_path(&backup, &relative)?;
                std::fs::create_dir_all(saved.parent().unwrap())?;
                std::fs::rename(&dest, &saved)?;
                backed_up.push((dest, saved));
            }
        }
        for (source, dest, _) in replacements {
            std::fs::create_dir_all(dest.parent().unwrap())?;
            std::fs::rename(source, &dest)?;
            installed.push(dest);
        }
        write_lock(root, &updated)?;
        Ok(())
    })();
    if let Err(e) = result {
        for path in installed {
            let _ = std::fs::remove_file(path);
        }
        for (dest, saved) in backed_up {
            std::fs::rename(saved, dest)?;
        }
        write_lock(root, old)?;
        return Err(e);
    }
    Ok(())
}

fn compatible(v: &Value, p: &Profile) -> bool {
    v["game_versions"]
        .as_array()
        .is_some_and(|x| x.contains(&json!(p.version)))
        && v["loaders"]
            .as_array()
            .is_some_and(|x| x.contains(&json!(p.loader)))
}
pub async fn import_pack(
    c: &reqwest::Client,
    root: &Path,
    p: &Profile,
    archive: &Path,
    source: &str,
    progress: &Progress,
) -> Result<()> {
    let staging = root.join(format!(".pack-{}", uuid::Uuid::new_v4()));
    net::unzip(archive, &staging, false)?;
    let result:Result<()>=async {
        if source=="modrinth"{
            let index:Value=serde_json::from_slice(&std::fs::read(staging.join("modrinth.index.json"))?)?;
            if index["game"]!="minecraft"||index["dependencies"]["minecraft"]!=p.version{return Err(Error::msg("Modpack Minecraft version differs from this installation"));}
            for loader in ["fabric-loader","quilt-loader","forge","neoforge"]{if let Some(v)=index["dependencies"][loader].as_str(){let expected=loader.trim_end_matches("-loader");if p.loader!=expected||p.loader_version!=v{return Err(Error::msg(format!("This pack requires {expected} {v}. Create a matching installation first.")));}}}
            let files=index["files"].as_array().ok_or_else(||Error::msg("Modpack has no files"))?;
            for (i,file) in files.iter().enumerate(){if file["env"]["client"]=="unsupported"{continue;}let relative=file["path"].as_str().unwrap_or("");let dest=net::safe_path(&staging.join("resolved"),relative)?;
                let url=file["downloads"][0].as_str().ok_or_else(||Error::msg("Pack file download missing"))?;
                let host=net::https(url)?.host_str().unwrap_or("").to_owned();if !["cdn.modrinth.com","github.com","raw.githubusercontent.com","gitlab.com"].contains(&host.as_str()){return Err(Error::msg(format!("Pack uses an untrusted download host: {host}")));}
                net::download(c,url,&dest,file["hashes"]["sha512"].as_str().unwrap_or(""),"sha512").await?;
                progress(json!({"stage":"Installing modpack files","current":i+1,"total":files.len()}));
            }
        }else{
            let index:Value=serde_json::from_slice(&std::fs::read(staging.join("manifest.json"))?)?;
            if index["minecraft"]["version"]!=p.version{return Err(Error::msg("Modpack Minecraft version differs from this installation"));}
            for loader in index["minecraft"]["modLoaders"].as_array().into_iter().flatten(){if loader["primary"]==true {let required=loader["id"].as_str().unwrap_or("");if required!=format!("{}-{}",p.loader,p.loader_version) {return Err(Error::msg(format!("Pack requires {required}; create a matching installation first")));}}}
            if let Some(overrides)=index["overrides"].as_str(){if overrides!="overrides"{let source=net::safe_path(&staging,overrides)?;if source.exists(){copy_tree(&source,&staging.join("overrides"))?;}}}
            for file in index["files"].as_array().into_iter().flatten(){let v=cf(c,&format!("mods/{}/files/{}",file["projectID"],file["fileID"])).await?;let hash=v["hashes"].as_array().and_then(|a|a.iter().find(|x|x["algo"]==1)).and_then(|x|x["value"].as_str()).unwrap_or("");let dest=net::safe_path(&staging.join("resolved/mods"),v["fileName"].as_str().unwrap_or(""))?;net::download(c,v["downloadUrl"].as_str().ok_or_else(||Error::msg("Pack file blocks third-party downloads"))?,&dest,hash,"sha1").await?;}
        }
        for directory in ["resolved","overrides","client-overrides"]{let src=staging.join(directory);if src.exists(){copy_tree(&src,root)?;}}
        Ok(())
    }.await;
    let _ = std::fs::remove_dir_all(staging);
    result
}
pub fn copy_tree(from: &Path, to: &Path) -> Result<()> {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        if entry.file_type()?.is_symlink() {
            return Err(Error::msg("Symbolic links cannot be imported"));
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        let target = net::safe_path(to, &name)?;
        if entry.file_type()?.is_dir() {
            copy_tree(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}
pub fn remove(root: &Path, filename: &str) -> Result<()> {
    let mut lock = read_lock(root)?;
    let all = list_content(root)?;
    let record = all
        .iter()
        .find(|x| x["filename"] == filename)
        .ok_or_else(|| Error::msg("Managed file not found"))?
        .clone();
    for x in &lock {
        for d in x["dependencies"].as_array().into_iter().flatten() {
            if d["dependency_type"] == "required" && d["project_id"] == record["projectId"] {
                return Err(Error::msg("Another installed mod requires this dependency"));
            }
        }
    }
    let folder = if record["kind"] == "mod" {
        "mods"
    } else {
        "resourcepacks"
    };
    let path = net::safe_path(&root.join(folder), filename)?;
    if path.exists() {
        std::fs::remove_file(path)?;
    }
    lock.retain(|x| x["filename"] != filename);
    write_lock(root, &lock)
}
pub fn order_packs(root: &Path, names: &[String]) -> Result<()> {
    for n in names {
        if !net::safe_path(&root.join("resourcepacks"), n)?.is_file() {
            return Err(Error::msg("Resource pack not installed"));
        }
    }
    let path = root.join("options.txt");
    let original = std::fs::read_to_string(&path).unwrap_or_default();
    let mut lines: Vec<String> = original
        .lines()
        .filter(|s| !s.starts_with("resourcePacks:"))
        .map(str::to_owned)
        .collect();
    let mut packs = vec!["vanilla".to_string()];
    packs.extend(names.iter().map(|n| format!("file/{n}")));
    lines.push(format!("resourcePacks:{}", serde_json::to_string(&packs)?));
    std::fs::write(path, lines.join("\n") + "\n")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn failed_commit_restores_previous_mod_and_lock() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("mods")).unwrap();
        std::fs::write(root.join("mods/old.jar"), b"old").unwrap();
        let old =
            vec![json!({"filename":"old.jar","projectId":"p","source":"modrinth","kind":"mod"})];
        write_lock(root, &old).unwrap();
        let stage = root.join("stage");
        std::fs::create_dir(&stage).unwrap();
        let records = vec![
            json!({"filename":"missing.jar","projectId":"p","source":"modrinth","kind":"mod"}),
        ];
        assert!(commit_content(root, &stage, &records, &old).is_err());
        assert_eq!(std::fs::read(root.join("mods/old.jar")).unwrap(), b"old");
        assert_eq!(read_lock(root).unwrap(), old);
    }
    #[test]
    fn refuses_unmanaged_file_collision() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("mods")).unwrap();
        std::fs::write(root.join("mods/local.jar"), b"local").unwrap();
        let records =
            vec![json!({"filename":"local.jar","projectId":"p","source":"modrinth","kind":"mod"})];
        assert!(commit_content(root, &root.join("stage"), &records, &[]).is_err());
        assert_eq!(
            std::fs::read(root.join("mods/local.jar")).unwrap(),
            b"local"
        );
    }
}
