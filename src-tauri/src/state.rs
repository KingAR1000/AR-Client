use crate::Message;
use crate::{Error, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::Path;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub version: String,
    pub loader: String,
    pub ram: u32,
    #[serde(default)]
    pub loader_version: String,
    #[serde(default)]
    pub java: String,
    #[serde(default = "balanced")]
    pub preset: String,
}
fn balanced() -> String {
    "Balanced".into()
}
impl Profile {
    pub fn validate(&self) -> Result<()> {
        uuid::Uuid::parse_str(&self.id)?;
        if self.name.trim().is_empty()
            || self.name.len() > 80
            || self.version.len() > 80
            || self.version.contains(['/', '\\', ':'])
            || self.version.contains("..")
        {
            return Err(Error::msg("Invalid profile name or version"));
        }
        if !(1024..=32768).contains(&self.ram) {
            return Err(Error::msg("RAM must be between 1024 and 32768 MiB"));
        }
        if !["vanilla", "fabric", "quilt", "forge", "neoforge"].contains(&self.loader.as_str()) {
            return Err(Error::msg("Unknown modloader"));
        }
        if !["Maximum FPS", "Balanced", "High Quality", "Custom"].contains(&self.preset.as_str()) {
            return Err(Error::msg("Invalid performance preset"));
        }
        Ok(())
    }
}
#[derive(Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub name: String,
    pub skin: Option<String>,
    #[serde(default)]
    pub capes: Vec<Value>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct State {
    pub profiles: Vec<Profile>,
    pub accounts: Vec<Account>,
    pub active_account: Option<String>,
    pub settings: Value,
}
impl Default for State {
    fn default() -> Self {
        Self {
            profiles: vec![],
            accounts: vec![],
            active_account: None,
            settings: json!({"microsoftClientId":option_env!("AR_MICROSOFT_CLIENT_ID").unwrap_or(""),"concurrentDownloads":6,"theme":"dark","closeOnLaunch":false,"eulaAccepted":false}),
        }
    }
}
pub fn read(root: &Path) -> Result<State> {
    let p = root.join("state.json");
    if !p.exists() {
        return Ok(State::default());
    }
    match serde_json::from_slice(&std::fs::read(&p)?) {
        Ok(state) => Ok(state),
        Err(original) => {
            let backup = root.join("state.json.bak");
            let mut recovered: State =
                serde_json::from_slice(&std::fs::read(&backup).map_err(|_| {
                    Error::msg(format!(
                        "Configuration is damaged and no readable backup exists: {original}"
                    ))
                })?)?;
            std::fs::rename(
                &p,
                root.join(format!("state.corrupt-{}.json", uuid::Uuid::new_v4())),
            )?;
            recovered.settings["recoveredFromBackup"] = json!(true);
            write(root, &recovered)?;
            Ok(recovered)
        }
    }
}
pub fn write(root: &Path, s: &State) -> Result<()> {
    std::fs::create_dir_all(root)?;
    let bytes = serde_json::to_vec_pretty(s)?;
    let tmp = root.join("state.json.tmp");
    {
        use std::io::Write;
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(&bytes)?;
        f.sync_all()?;
    }
    let dest = root.join("state.json");
    // Preserve a recoverable copy before Windows replacement.
    if dest.exists() {
        std::fs::copy(&dest, root.join("state.json.bak"))?;
        #[cfg(windows)]
        std::fs::remove_file(&dest)?;
    }
    std::fs::rename(tmp, dest)?;
    Ok(())
}
pub fn secret_set(id: &str, value: &str) -> Result<()> {
    keyring::Entry::new("xyz.kingar1000.arclient", id)?.set_password(value)?;
    Ok(())
}
pub fn secret_get(id: &str) -> Result<String> {
    Ok(keyring::Entry::new("xyz.kingar1000.arclient", id)?.get_password()?)
}
pub fn secret_delete(id: &str) -> Result<()> {
    match keyring::Entry::new("xyz.kingar1000.arclient", id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.into()),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_ram_and_loader() {
        let mut p = Profile {
            id: uuid::Uuid::new_v4().to_string(),
            name: "Survival".into(),
            version: "26.3".into(),
            loader: "fabric".into(),
            ram: 4096,
            loader_version: String::new(),
            java: String::new(),
            preset: balanced(),
        };
        assert!(p.validate().is_ok());
        p.ram = 0;
        assert!(p.validate().is_err());
    }
    #[test]
    fn recovers_valid_backup_without_destroying_corrupt_file() {
        let d = tempfile::tempdir().unwrap();
        let state = State::default();
        write(d.path(), &state).unwrap();
        write(d.path(), &state).unwrap();
        std::fs::write(d.path().join("state.json"), b"broken").unwrap();
        let recovered = read(d.path()).unwrap();
        assert_eq!(recovered.settings["recoveredFromBackup"], true);
        assert!(std::fs::read_dir(d.path()).unwrap().flatten().any(|e| e
            .file_name()
            .to_string_lossy()
            .starts_with("state.corrupt-")));
    }
    #[test]
    fn persists_state() {
        let d = tempfile::tempdir().unwrap();
        let s = State::default();
        write(d.path(), &s).unwrap();
        assert!(read(d.path()).unwrap().profiles.is_empty());
    }
}
