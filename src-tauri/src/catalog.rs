use crate::Message;
use serde_json::{json,Value};
use std::{collections::HashSet,path::Path};
use crate::{net,state::{self,Profile},install::{urlencoding,Progress},Error,Result};
const MR:&str="https://api.modrinth.com/v2";
async fn cf(c:&reqwest::Client,path:&str)->Result<Value>{let key=state::secret_get("curseforge").map_err(|_|Error::msg("Add your CurseForge API key in Settings. Modrinth works without a key."))?;Ok(c.get(format!("https://api.curseforge.com/v1/{path}")).header("x-api-key",key).send().await?.error_for_status()?.json::<Value>().await?["data"].clone())}
pub async fn search(c:&reqwest::Client,source:&str,kind:&str,query:&str,p:&Profile,offset:u64)->Result<Value>{
    if source=="curseforge"{let class=match kind{"mod"=>6,"resourcepack"=>12,"modpack"=>4471,_=>return Err(Error::msg("Invalid project type"))};let v=cf(c,&format!("mods/search?gameId=432&classId={class}&gameVersion={}&searchFilter={}&index={offset}&pageSize=20",urlencoding(&p.version),urlencoding(query))).await?;return Ok(json!({"hits":v.as_array().into_iter().flatten().map(|x|json!({"project_id":x["id"].to_string(),"title":x["name"],"description":x["summary"],"icon_url":x["logo"]["thumbnailUrl"],"downloads":x["downloadCount"],"author":x["authors"][0]["name"]})).collect::<Vec<_>>() }));}
    if source!="modrinth"{return Err(Error::msg("Unknown catalog"));}
    let mut facets=vec![vec![format!("project_type:{kind}")],vec![format!("versions:{}",p.version)]];
    if kind=="mod" && p.loader!="vanilla" {facets.push(vec![format!("categories:{}",p.loader)]);}
    net::json(c,&format!("{MR}/search?query={}&facets={}&limit=20&offset={offset}",urlencoding(query),urlencoding(&serde_json::to_string(&facets)?))).await
}
pub async fn project_versions(c:&reqwest::Client,source:&str,id:&str,p:&Profile,kind:&str)->Result<Value>{
    if source=="curseforge"{return cf(c,&format!("mods/{}/files?gameVersion={}&modLoaderType={}",urlencoding(id),urlencoding(&p.version),match p.loader.as_str(){"forge"=>1,"fabric"=>4,"quilt"=>5,"neoforge"=>6,_=>0})).await;}
    let filter=if kind=="mod"{format!("&loaders={}",urlencoding(&json!([p.loader]).to_string()))}else{String::new()};
    net::json(c,&format!("{MR}/project/{}/version?game_versions={}{}",urlencoding(id),urlencoding(&json!([p.version]).to_string()),filter)).await
}
pub fn read_lock(root:&Path)->Result<Vec<Value>>{let path=root.join("ar-content.json");if !path.exists(){return Ok(vec![]);}Ok(serde_json::from_slice(&std::fs::read(path)?)?)}
fn write_lock(root:&Path,lock:&[Value])->Result<()>{std::fs::write(root.join("ar-content.json"),serde_json::to_vec_pretty(lock)?)?;Ok(())}
pub async fn install(c:&reqwest::Client,root:&Path,p:&Profile,source:&str,id:&str,kind:&str,progress:Progress)->Result<Value>{
    if kind=="mod" && p.loader=="vanilla" {return Err(Error::msg("Choose a modloader installation before adding mods"));}
    if !["mod","resourcepack","modpack"].contains(&kind){return Err(Error::msg("Invalid content type"));}
    std::fs::create_dir_all(root)?;
    let mut pending=vec![id.to_string()];let mut seen=HashSet::new();let mut plan=vec![];
    while let Some(project)=pending.pop(){
        if !seen.insert(project.clone()){continue;}
        if seen.len()>256{return Err(Error::msg("Dependency graph exceeds safety limit"));}
        let versions=project_versions(c,source,&project,p,kind).await?;
        let version=versions.as_array().and_then(|v|v.first()).ok_or_else(||Error::msg(format!("No compatible release for project {project}")))?.clone();
        if source=="modrinth" {
            plan.push((project.clone(),version.clone()));
            for dep in version["dependencies"].as_array().into_iter().flatten(){if dep["dependency_type"]=="required"{
                if let Some(exact)=dep["version_id"].as_str(){let v=net::json(c,&format!("{MR}/version/{}",urlencoding(exact))).await?;let pid=v["project_id"].as_str().ok_or_else(||Error::msg("Dependency project missing"))?;
                    if seen.insert(pid.to_owned()) {if !compatible(&v,p){return Err(Error::msg("A required dependency is incompatible with this installation"));}plan.push((pid.to_owned(),v.clone()));for sub in v["dependencies"].as_array().into_iter().flatten(){if sub["dependency_type"]=="required"{if let Some(id)=sub["project_id"].as_str(){pending.push(id.into());}else{return Err(Error::msg("Nested pinned dependency requires manual resolution"));}}}}
                }else if let Some(id)=dep["project_id"].as_str(){pending.push(id.into());}
            }}
        }else{
            for dep in version["dependencies"].as_array().into_iter().flatten(){if dep["relationType"]==3{pending.push(dep["modId"].to_string());}}
            plan.push((project,version));
        }
    }
    let lock=read_lock(root)?;
    for (_,v) in &plan{for dep in v["dependencies"].as_array().into_iter().flatten(){if dep["dependency_type"]=="incompatible" {if let Some(id)=dep["project_id"].as_str(){if lock.iter().any(|x|x["projectId"]==id)||plan.iter().any(|(pid,_)|pid==id){return Err(Error::msg("An incompatible mod is already installed or required"));}}}}}
    let staging=root.join(format!(".staging-{}",uuid::Uuid::new_v4()));std::fs::create_dir_all(&staging)?;
    let mut records=vec![];
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
    if let Err(e)=result{let _=std::fs::remove_dir_all(&staging);return Err(e);}
    let mut updated=lock;
    for record in &records {
        let name=record["filename"].as_str().unwrap();
        if kind=="modpack"{import_pack(c,root,p,&staging.join(name),source,&progress).await?;continue;}
        let folder=root.join(if kind=="mod"{"mods"}else{"resourcepacks"});std::fs::create_dir_all(&folder)?;
        let dest=net::safe_path(&folder,name)?;
        if dest.exists() && !updated.iter().any(|x|x["filename"]==name && x["projectId"]==record["projectId"]){return Err(Error::msg("An unmanaged file has the same name; refusing to overwrite it"));}
        if dest.exists(){std::fs::remove_file(&dest)?;}
        std::fs::rename(staging.join(name),dest)?;
        for previous in updated.iter().filter(|x|x["projectId"]==record["projectId"]&&x["source"]==source&&x["filename"]!=name){if let Some(n)=previous["filename"].as_str(){let old=net::safe_path(&folder,n)?;if old.exists(){std::fs::remove_file(old)?;}}}
        updated.retain(|x|!(x["projectId"]==record["projectId"]&&x["source"]==source));updated.push(record.clone());
    }
    write_lock(root,&updated)?;std::fs::remove_dir_all(staging)?;
    Ok(json!(records))
}
fn compatible(v:&Value,p:&Profile)->bool{v["game_versions"].as_array().is_some_and(|x|x.contains(&json!(p.version)))&&v["loaders"].as_array().is_some_and(|x|x.contains(&json!(p.loader)))}
pub async fn import_pack(c:&reqwest::Client,root:&Path,p:&Profile,archive:&Path,source:&str,progress:&Progress)->Result<()> {
    let staging=root.join(format!(".pack-{}",uuid::Uuid::new_v4()));net::unzip(archive,&staging,false)?;
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
            for file in index["files"].as_array().into_iter().flatten(){let v=cf(c,&format!("mods/{}/files/{}",file["projectID"],file["fileID"])).await?;let hash=v["hashes"].as_array().and_then(|a|a.iter().find(|x|x["algo"]==1)).and_then(|x|x["value"].as_str()).unwrap_or("");let dest=net::safe_path(&staging.join("resolved/mods"),v["fileName"].as_str().unwrap_or(""))?;net::download(c,v["downloadUrl"].as_str().ok_or_else(||Error::msg("Pack file blocks third-party downloads"))?,&dest,hash,"sha1").await?;}
        }
        for directory in ["resolved","overrides","client-overrides"]{let src=staging.join(directory);if src.exists(){copy_tree(&src,root)?;}}
        Ok(())
    }.await;
    let _=std::fs::remove_dir_all(staging);result
}
pub fn copy_tree(from:&Path,to:&Path)->Result<()>{std::fs::create_dir_all(to)?;for entry in std::fs::read_dir(from)? {let entry=entry?;if entry.file_type()?.is_symlink(){return Err(Error::msg("Symbolic links cannot be imported"));}let name=entry.file_name().to_string_lossy().into_owned();let target=net::safe_path(to,&name)?;if entry.file_type()?.is_dir(){copy_tree(&entry.path(),&target)?;}else{std::fs::copy(entry.path(),target)?;}}Ok(())}
pub fn remove(root:&Path,filename:&str)->Result<()>{let mut lock=read_lock(root)?;let record=lock.iter().find(|x|x["filename"]==filename).ok_or_else(||Error::msg("Managed file not found"))?.clone();for x in &lock{for d in x["dependencies"].as_array().into_iter().flatten(){if d["dependency_type"]=="required"&&d["project_id"]==record["projectId"]{return Err(Error::msg("Another installed mod requires this dependency"));}}}let folder=if record["kind"]=="mod"{"mods"}else{"resourcepacks"};let path=net::safe_path(&root.join(folder),filename)?;if path.exists(){std::fs::remove_file(path)?;}lock.retain(|x|x["filename"]!=filename);write_lock(root,&lock)}
pub fn order_packs(root:&Path,names:&[String])->Result<()>{for n in names{if !net::safe_path(&root.join("resourcepacks"),n)?.is_file(){return Err(Error::msg("Resource pack not installed"));}}let path=root.join("options.txt");let original=std::fs::read_to_string(&path).unwrap_or_default();let mut lines:Vec<String>=original.lines().filter(|s|!s.starts_with("resourcePacks:")).map(str::to_owned).collect();let mut packs=vec!["vanilla".to_string()];packs.extend(names.iter().map(|n|format!("file/{n}")));lines.push(format!("resourcePacks:{}",serde_json::to_string(&packs)?));std::fs::write(path,lines.join("\n")+"\n")?;Ok(())}
