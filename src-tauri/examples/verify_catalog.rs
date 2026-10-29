//! Live Modrinth compatibility/dependency/download check, without Minecraft login.
use ar_core::{catalog, install, net, state::Profile};
use std::sync::Arc;
#[tokio::main]
async fn main() -> ar_core::Result<()> {
    let c = net::client();
    let version = install::versions(&c).await?["latest"]["release"]
        .as_str()
        .ok_or("Official stable release missing")?
        .to_owned();
    let loaders = install::loaders(&c, "fabric", &version).await?;
    let loader_version = loaders
        .as_array()
        .and_then(|entries| {
            entries
                .iter()
                .find(|entry| entry["loader"]["stable"] == true)
        })
        .and_then(|entry| entry["loader"]["version"].as_str())
        .ok_or("No stable Fabric loader available for the latest release")?
        .to_owned();
    let p = Profile {
        id: "11111111-1111-4111-8111-111111111111".into(),
        name: "Verification".into(),
        version,
        loader: "fabric".into(),
        loader_version,
        ram: 2048,
        java: String::new(),
        preset: "Custom".into(),
    };
    let progress = Arc::new(|v: serde_json::Value| println!("{}", v["stage"]));
    let results = catalog::search(&c, "modrinth", "mod", "sodium", &p, 0).await?;
    assert!(!results["hits"].as_array().unwrap().is_empty());
    let root = std::env::temp_dir()
        .join("ar-client-catalog-check")
        .join(&p.version);
    for id in ["sodium", "lithium", "fabric-api"] {
        catalog::install(&c, &root, &p, "modrinth", id, "mod", progress.clone()).await?;
    }
    println!(
        "Verified {} managed files",
        catalog::read_lock(&root)?.len()
    );
    for loader in ["fabric", "quilt", "forge", "neoforge"] {
        match install::loaders(&c, loader, &p.version).await {
            Ok(v) => println!(
                "{loader}: {} compatible entries",
                v.as_array().map_or(0, Vec::len)
            ),
            Err(e) => println!("{loader} metadata error: {e}"),
        }
    }
    Ok(())
}
