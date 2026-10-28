//! Opt-in live integration check. Downloads official game files; never authenticates or launches.
use std::{path::PathBuf,sync::{Arc,Mutex}};
use ar_core::{install,state::Profile,net};
#[tokio::main]
async fn main()->ar_core::Result<()>{
 let args:Vec<String>=std::env::args().collect();
 let version=args.get(1).map(String::as_str).unwrap_or("1.21.9");
 let loader=args.get(2).map(String::as_str).unwrap_or("vanilla");
 let loader_version=args.get(3).cloned().unwrap_or_default();
 let p=Profile{id:"11111111-1111-4111-8111-111111111111".into(),name:"Integration verification".into(),version:version.into(),loader:loader.into(),loader_version,ram:2048,java:std::env::var("AR_TEST_JAVA").unwrap_or_default(),preset:"Custom".into()};
 let last=Arc::new(Mutex::new(String::new()));
 let progress=Arc::new(move|v:serde_json::Value|{let mut previous=last.lock().unwrap();let stage=v["stage"].as_str().unwrap_or("");if *previous!=stage{println!("{stage}");*previous=stage.into();}});
 let i=install::install(&net::client(),&PathBuf::from("/tmp/ar-install-verification"),&p,progress).await?;
 println!("Verified {} classpath entries for {} / {}",i.classpath.len(),p.version,p.loader);Ok(())
}
