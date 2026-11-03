//! Size-bounded OS-vault entries. Tokens never fall back to plaintext files.
use crate::{Error, Message, Result};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

const SERVICE: &str = "xyz.kingar1000.arclient";
const PREFIX: &str = "AR_CLIENT_VAULT_V1:";
// 1,500 bytes become 2,000 ASCII characters, below Windows' 2,560 UTF-16 limit.
const CHUNK_BYTES: usize = 1500;
const MAX_BYTES: usize = 256 * 1024;
static LOCK: Mutex<()> = Mutex::new(());

trait Store {
    fn get(&self, id: &str) -> Result<Option<String>>;
    fn set(&self, id: &str, value: &str) -> Result<()>;
    fn delete(&self, id: &str) -> Result<()>;
}
struct OsStore;
impl Store for OsStore {
    fn get(&self, id: &str) -> Result<Option<String>> {
        match keyring::Entry::new(SERVICE, id)?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }
    fn set(&self, id: &str, value: &str) -> Result<()> {
        Ok(keyring::Entry::new(SERVICE, id)?.set_password(value)?)
    }
    fn delete(&self, id: &str) -> Result<()> {
        match keyring::Entry::new(SERVICE, id)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.into()),
        }
    }
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Manifest {
    generation: String,
    bytes: usize,
}
impl Manifest {
    fn parse(value: &str) -> Result<Option<Self>> {
        let Some(json) = value.strip_prefix(PREFIX) else {
            return Ok(None); // Existing single-entry credentials remain readable.
        };
        let invalid = || Error::msg("Saved credential is incomplete or invalid. Sign in again.");
        let m: Self = serde_json::from_str(json).map_err(|_| invalid())?;
        let uuid = uuid::Uuid::parse_str(&m.generation).map_err(|_| invalid())?;
        if m.bytes == 0 || m.bytes > MAX_BYTES || uuid.to_string() != m.generation {
            return Err(invalid());
        }
        Ok(Some(m))
    }
    fn count(&self) -> usize {
        self.bytes.div_ceil(CHUNK_BYTES)
    }
    fn key(&self, index: usize) -> String {
        format!("ar-vault/{}/{index}", self.generation)
    }
    fn cleanup(&self, store: &impl Store) -> Result<()> {
        let mut first_error = None;
        for i in 0..self.count() {
            if let Err(e) = store.delete(&self.key(i)) {
                first_error.get_or_insert(e);
            }
        }
        first_error.map_or(Ok(()), Err)
    }
}
fn put(store: &impl Store, id: &str, value: &str) -> Result<()> {
    if value.len() > MAX_BYTES {
        return Err(Error::msg(
            "Credential exceeds the secure storage size limit.",
        ));
    }
    let previous = store.get(id)?;
    // A fresh sign-in can replace corrupt metadata; never follow invalid chunk keys.
    let old = previous
        .as_deref()
        .and_then(|v| Manifest::parse(v).ok())
        .flatten();
    if value.encode_utf16().count() <= 2000 && !value.starts_with(PREFIX) {
        store.set(id, value)?;
    } else {
        let next = Manifest {
            generation: uuid::Uuid::new_v4().to_string(),
            bytes: value.len(),
        };
        let result = (|| {
            for (i, chunk) in value.as_bytes().chunks(CHUNK_BYTES).enumerate() {
                store.set(&next.key(i), &STANDARD.encode(chunk))?;
            }
            // Publish only after every chunk exists. Failed saves preserve the old generation.
            store.set(id, &format!("{PREFIX}{}", serde_json::to_string(&next)?))
        })();
        if let Err(e) = result {
            let _ = next.cleanup(store);
            return Err(e);
        }
    }
    if let Some(old) = old {
        // A cleanup failure must not report the newly committed credential as a failed save.
        let _ = old.cleanup(store);
    }
    Ok(())
}
fn get(store: &impl Store, id: &str) -> Result<String> {
    let value = store
        .get(id)?
        .ok_or_else(|| Error::msg("No saved credential. Sign in again."))?;
    let Some(m) = Manifest::parse(&value)? else {
        return Ok(value);
    };
    let invalid = || Error::msg("Saved credential is incomplete or invalid. Sign in again.");
    let mut bytes = Vec::with_capacity(m.bytes);
    for i in 0..m.count() {
        let encoded = store.get(&m.key(i))?.ok_or_else(invalid)?;
        if encoded.len() > 2000 {
            return Err(invalid());
        }
        let chunk = STANDARD.decode(encoded).map_err(|_| invalid())?;
        let expected = (m.bytes - i * CHUNK_BYTES).min(CHUNK_BYTES);
        if chunk.len() != expected {
            return Err(invalid());
        }
        bytes.extend_from_slice(&chunk);
    }
    String::from_utf8(bytes).map_err(|_| invalid())
}
fn remove(store: &impl Store, id: &str) -> Result<()> {
    let previous = store.get(id)?;
    let old = previous
        .as_deref()
        .and_then(|v| Manifest::parse(v).ok())
        .flatten();
    store.delete(id)?;
    if let Some(m) = old {
        m.cleanup(store)?;
    }
    Ok(())
}
pub fn set(id: &str, value: &str) -> Result<()> {
    let _guard = LOCK
        .lock()
        .map_err(|_| Error::msg("Secure storage lock failed"))?;
    put(&OsStore, id, value)
}
pub fn read(id: &str) -> Result<String> {
    let _guard = LOCK
        .lock()
        .map_err(|_| Error::msg("Secure storage lock failed"))?;
    get(&OsStore, id)
}
pub fn delete(id: &str) -> Result<()> {
    let _guard = LOCK
        .lock()
        .map_err(|_| Error::msg("Secure storage lock failed"))?;
    remove(&OsStore, id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        cell::{Cell, RefCell},
        collections::HashMap,
    };
    #[derive(Default)]
    struct Memory {
        values: RefCell<HashMap<String, String>>,
        writes: Cell<usize>,
        fail_at: Cell<Option<usize>>,
    }
    impl Store for Memory {
        fn get(&self, id: &str) -> Result<Option<String>> {
            Ok(self.values.borrow().get(id).cloned())
        }
        fn set(&self, id: &str, value: &str) -> Result<()> {
            // Model the actual Windows limit, including surrogate pairs.
            assert!(value.encode_utf16().count() <= 2560);
            let n = self.writes.get();
            self.writes.set(n + 1);
            if self.fail_at.get() == Some(n) {
                return Err(Error::msg("Injected vault write failure"));
            }
            self.values.borrow_mut().insert(id.into(), value.into());
            Ok(())
        }
        fn delete(&self, id: &str) -> Result<()> {
            self.values.borrow_mut().remove(id);
            Ok(())
        }
    }
    #[test]
    fn large_tokens_unicode_and_boundary_values_fit_windows_vault() {
        let store = Memory::default();
        for value in [
            "x".repeat(2000),
            "x".repeat(2001),
            "x".repeat(2560),
            "x".repeat(18000),
            "🦀".repeat(3000),
            "x".repeat(MAX_BYTES),
        ] {
            put(&store, "account", &value).unwrap();
            assert_eq!(get(&store, "account").unwrap(), value);
        }
        remove(&store, "account").unwrap();
        assert!(store.values.borrow().is_empty());
        remove(&store, "account").unwrap();
    }
    #[test]
    fn legacy_credentials_migrate_and_accounts_stay_isolated() {
        let store = Memory::default();
        store.set("first", "legacy-refresh-token").unwrap();
        store.set("curseforge", "catalog-key").unwrap();
        assert_eq!(get(&store, "first").unwrap(), "legacy-refresh-token");
        put(&store, "first", &"a".repeat(9000)).unwrap();
        put(&store, "second", &"b".repeat(8000)).unwrap();
        put(&store, "first", "new-short-token").unwrap();
        remove(&store, "second").unwrap();
        assert_eq!(get(&store, "first").unwrap(), "new-short-token");
        assert_eq!(get(&store, "curseforge").unwrap(), "catalog-key");
        assert_eq!(store.values.borrow().len(), 2);
    }
    #[test]
    fn failed_chunk_or_manifest_write_preserves_previous_credentials() {
        for failed_write in 0..=4 {
            let store = Memory::default();
            put(&store, "account", &"old".repeat(3000)).unwrap();
            let original = store.values.borrow().clone();
            store.fail_at.set(Some(store.writes.get() + failed_write));
            assert!(put(&store, "account", &"new".repeat(2000)).is_err());
            assert_eq!(*store.values.borrow(), original);
            assert_eq!(get(&store, "account").unwrap(), "old".repeat(3000));
        }
    }
    #[test]
    fn incomplete_or_invalid_storage_fails_without_exposing_tokens() {
        let store = Memory::default();
        put(&store, "account", &"sensitive".repeat(1000)).unwrap();
        let m = Manifest::parse(&store.get("account").unwrap().unwrap())
            .unwrap()
            .unwrap();
        store.delete(&m.key(1)).unwrap();
        let error = get(&store, "account").unwrap_err().to_string();
        assert!(!error.contains("sensitive"));
        assert!(error.contains("Sign in again"));
        store
            .set(
                "bad",
                &format!("{PREFIX}{{\"generation\":\"../account\",\"bytes\":999999999}}"),
            )
            .unwrap();
        assert!(get(&store, "bad").is_err());
        assert!(put(&store, "oversized", &"x".repeat(MAX_BYTES + 1)).is_err());
        assert!(store.get("oversized").unwrap().is_none());
    }
    #[cfg(windows)]
    #[test]
    fn real_windows_vault_handles_long_login_refresh_and_logout() {
        let id = format!("vault-regression-{}", uuid::Uuid::new_v4());
        let result = (|| -> Result<()> {
            let tokens = serde_json::json!({"refresh_token":"r".repeat(4000),"access_token":"m".repeat(5000),"minecraft":{"access_token":"c".repeat(6000)}}).to_string();
            set(&id, &tokens)?;
            assert_eq!(read(&id)?, tokens);
            set(&id, &"refreshed".repeat(2000))?;
            assert_eq!(read(&id)?, "refreshed".repeat(2000));
            delete(&id)?;
            assert!(read(&id).is_err());
            Ok(())
        })();
        let _ = delete(&id);
        result.unwrap();
    }
}
