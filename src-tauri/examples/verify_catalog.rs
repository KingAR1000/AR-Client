//! Live Modrinth compatibility/dependency/download check, without Minecraft login.
use ar_core::{catalog, install, net, state::Profile};
use std::{path::PathBuf, sync::Arc};
#[tokio::main]
async fn main() -> ar_core::Result<()> {
    let c = net::client();
    let p = Profile {
        id: "11111111-1111-4111-8111-111111111111".into(),
        name: "Verification".into(),
        version: "1.21.9".into(),
        loader: "fabric".into(),
        loader_version: "0.17.2".into(),
        ram: 2048,
        java: String::new(),
        preset: "Custom".into(),
    };
    let progress = Arc::new(|v: serde_json::Value| println!("{}", v["stage"]));
    let results = catalog::search(&c, "modrinth", "mod", "sodium", &p, 0).await?;
    assert!(!results["hits"].as_array().unwrap().is_empty());
    let root = PathBuf::from("/tmp/ar-catalog-verification-v2");
    for id in ["sodium", "lithium", "fabric-api"] {
        catalog::install(&c, &root, &p, "modrinth", id, "mod", progress.clone()).await?;
    }
    println!(
        "Verified {} managed files",
        catalog::read_lock(&root)?.len()
    );
    for loader in ["fabric", "quilt", "forge", "neoforge"] {
        match install::loaders(&c, loader, "1.21.9").await {
            Ok(v) => println!(
                "{loader}: {} compatible entries",
                v.as_array().map_or(0, Vec::len)
            ),
            Err(e) => println!("{loader} metadata error: {e}"),
        }
    }
    Ok(())
}
