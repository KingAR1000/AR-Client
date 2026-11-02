//! Live, loopback-only Mojang dedicated-server startup/console/graceful-save check.
use ar_core::{hosting::Hosting, install, net};
use serde_json::json;
use std::sync::Arc;
#[tokio::main]
async fn main() -> ar_core::Result<()> {
    if !std::env::args().any(|a| a == "--accept-eula") {
        return Err("Read https://www.minecraft.net/eula, then pass --accept-eula to run this live server check.".into());
    }
    let root =
        std::env::temp_dir().join(format!("ar-server-verification-{}", uuid::Uuid::new_v4()));
    let c = net::client();
    let h = Hosting::default();
    let progress: install::Progress = Arc::new(|v| println!("{}", v["stage"]));
    let result:ar_core::Result<()>=async {
 let latest=install::versions(&c).await?["latest"]["release"].as_str().ok_or("Release missing")?.to_string();
 let s=h.dispatch(&root,&c,"server.create",&json!({"id":"","name":"Loopback verification","version":latest,"ram":2048,"port":25568}),true,progress.clone()).await?;
 let id=s["id"].as_str().unwrap();let dir=root.join("servers").join(id);
 std::fs::write(dir.join("server.properties"),"server-ip=127.0.0.1\nserver-port=25568\nonline-mode=true\nwhite-list=true\nenforce-whitelist=true\nenable-rcon=false\nview-distance=2\nsimulation-distance=2\nspawn-chunk-radius=0\n")?;
 h.dispatch(&root,&c,"server.start",&json!({"id":id}),true,progress.clone()).await?;
 let mut ready=false;
 for _ in 0..180 {let lines=h.dispatch(&root,&c,"server.logs",&json!({"id":id}),true,progress.clone()).await?;if lines.as_array().unwrap().iter().any(|line|line.as_str().is_some_and(|s|s.contains("Done (")&&s.contains("For help"))){ready=true;break;}tokio::time::sleep(std::time::Duration::from_secs(1)).await;}
 if !ready {let logs=h.dispatch(&root,&c,"server.logs",&json!({"id":id}),true,progress.clone()).await?;println!("{logs}");return Err("Server did not become ready".into());}
 h.dispatch(&root,&c,"server.command",&json!({"id":id,"command":"list"}),true,progress.clone()).await?;
 h.shutdown().await?;
 if !dir.join("world/level.dat").is_file(){return Err("Server world was not saved".into());}
 println!("Verified server startup, console, graceful stop and saved world: {}",dir.display());Ok(())
 }.await;
    let stopped = h.shutdown().await;
    result?;
    stopped
}
