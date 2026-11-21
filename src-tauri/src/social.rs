use crate::{auth, state, Error, Message, Result};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use futures_util::StreamExt;
use ring::{rand::SecureRandom, signature};
use serde_json::{json, Value};
use std::{collections::HashMap, time::Duration};
use tokio::sync::Mutex;
const URL: &str = match option_env!("AR_SOCIAL_URL") {
    Some(url) => url,
    None => "https://social.client.kingar1000.xyz/",
};
const ACTIONS: [&str; 10] = [
    "state",
    "request",
    "accept",
    "remove",
    "block",
    "unblock",
    "messages",
    "send",
    "logout",
    "delete-account",
];
#[derive(Default)]
pub struct Social {
    sessions: Mutex<HashMap<String, (String, u64)>>,
}
impl Social {
    pub async fn call(
        &self,
        client: &reqwest::Client,
        account: &str,
        client_id: &str,
        mut args: Value,
    ) -> Result<Value> {
        let endpoint = crate::net::https(URL)?;
        let action = args["action"].as_str().unwrap_or("").to_owned();
        if !ACTIONS.contains(&action.as_str()) {
            return Err(Error::msg("Unknown social action"));
        }
        if action == "request" {
            if let Some(name) = args["target"].as_str().map(str::trim) {
                if let Some(id) = resolve(client, name).await? {
                    args["target"] = json!(id);
                }
            }
        }
        for attempt in 0..2 {
            let token = {
                let mut sessions = self.sessions.lock().await;
                if sessions
                    .get(account)
                    .is_none_or(|(_, expires)| *expires <= now() + 60000)
                {
                    let session = establish(client, &endpoint, account, client_id).await?;
                    sessions.insert(account.into(), session);
                }
                sessions
                    .get(account)
                    .ok_or("Social session missing")?
                    .0
                    .clone()
            };
            let response = send(client.post(endpoint.clone()).bearer_auth(token).json(&args)).await?;
            let status = response.status();
            if status.as_u16() == 401 && attempt == 0 {
                self.sessions.lock().await.remove(account);
                continue;
            }
            let body = response_json(response).await?;
            if !status.is_success() {
                return Err(Error::msg(
                    body["error"].as_str().unwrap_or("Social request failed"),
                ));
            }
            if action == "logout" || action == "delete-account" {
                self.sessions.lock().await.remove(account);
            }
            return Ok(body);
        }
        Err(Error::msg("Social session expired. Sign in again."))
    }
    pub async fn forget(&self, id: &str) {
        self.sessions.lock().await.remove(id);
    }
}
pub fn active<'a>(state: &'a state::State) -> Result<&'a str> {
    state
        .active_account
        .as_deref()
        .ok_or_else(|| Error::msg("Sign in with Microsoft before using friends and chat"))
}
fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
async fn send(request: reqwest::RequestBuilder) -> Result<reqwest::Response> {
    request
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(|_| Error::msg("Can't reach the AR Client friends service. Check your internet connection and try again."))
}
// Mojang blocks requests from Cloudflare Workers, so the launcher gathers Mojang-signed proof of identity
// itself: the signed profile (ID + current name) and the chat-signing certificate, then proves possession of
// that certificate's private key. The Minecraft access token and private key never leave this computer.
async fn establish(
    client: &reqwest::Client,
    endpoint: &url::Url,
    account: &str,
    client_id: &str,
) -> Result<(String, u64)> {
    let minecraft = auth::access(client, client_id, account).await?;
    let response = send(
        client
            .post("https://api.minecraftservices.com/player/certificates")
            .bearer_auth(&minecraft)
            .header("Content-Length", "0"),
    )
    .await?;
    if !response.status().is_success() {
        return Err(Error::msg(format!(
            "Minecraft did not issue a profile certificate (HTTP {}). Friends needs online multiplayer to be allowed for this account in its Xbox privacy and family settings.",
            response.status().as_u16()
        )));
    }
    let certificate = response_json(response).await?;
    let response = send(client.get(format!(
        "https://sessionserver.mojang.com/session/minecraft/profile/{account}?unsigned=false"
    )))
    .await?;
    if !response.status().is_success() {
        return Err(Error::msg(format!(
            "Mojang's profile service is unavailable (HTTP {}). Try again in a minute.",
            response.status().as_u16()
        )));
    }
    let profile = response_json(response).await?;
    let textures = profile["properties"]
        .as_array()
        .and_then(|p| p.iter().find(|p| p["name"] == "textures"))
        .filter(|p| p["signature"].is_string())
        .ok_or("Mojang did not return a signed profile")?;
    let private = pem(certificate["keyPair"]["privateKey"].as_str())?;
    let public = pem(certificate["keyPair"]["publicKey"].as_str())?;
    let host = &endpoint[url::Position::BeforeHost..url::Position::AfterPort];
    let rng = ring::rand::SystemRandom::new();
    let mut nonce = [0u8; 16];
    rng.fill(&mut nonce).map_err(|_| "Secure random unavailable")?;
    let (timestamp, nonce) = (now(), hex::encode(nonce));
    let statement = format!("AR Client social session v2\n{host}\n{account}\n{timestamp}\n{nonce}");
    let proof = sign(&private, statement.as_bytes(), &rng)?;
    let response = send(client.post(endpoint.clone()).json(&json!({
        "action": "session",
        "textures": {"value": textures["value"], "signature": textures["signature"]},
        "certificate": {
            "publicKey": STANDARD.encode(public),
            "signature": certificate["publicKeySignatureV2"],
            "expiresAt": certificate["expiresAt"],
        },
        "proof": {"timestamp": timestamp, "nonce": nonce, "signature": STANDARD.encode(proof)},
    })))
    .await?;
    let status = response.status();
    let session = response_json(response).await?;
    if !status.is_success() {
        return Err(Error::msg(format!(
            "Friends sign-in failed: {}",
            session["error"].as_str().unwrap_or("the service rejected the session")
        )));
    }
    if session["id"] != account {
        return Err(Error::msg("Social identity mismatch"));
    }
    let token = session["token"]
        .as_str()
        .filter(|s| s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit()))
        .ok_or("Invalid social session")?;
    let expires = session["expires"].as_u64().ok_or("Missing session expiry")?;
    Ok((token.into(), expires))
}
// Mojang labels these "RSA PRIVATE/PUBLIC KEY", but the contents are PKCS#8 and X.509 SubjectPublicKeyInfo.
fn pem(value: Option<&str>) -> Result<Vec<u8>> {
    let body: String = value
        .ok_or("Minecraft certificate is missing its key pair")?
        .lines()
        .filter(|line| !line.starts_with("-----"))
        .collect();
    Ok(STANDARD.decode(body.trim())?)
}
fn sign(pkcs8: &[u8], message: &[u8], rng: &ring::rand::SystemRandom) -> Result<Vec<u8>> {
    let key = signature::RsaKeyPair::from_pkcs8(pkcs8)
        .map_err(|e| Error::msg(format!("Minecraft certificate key is unusable: {e}")))?;
    let mut out = vec![0; key.public().modulus_len()];
    key.sign(&signature::RSA_PKCS1_SHA256, rng, message, &mut out)
        .map_err(|_| "Could not sign the friends sign-in proof")?;
    Ok(out)
}
// Resolve usernames on this computer: Mojang serves players directly but blocks the Cloudflare-hosted service.
async fn resolve(client: &reqwest::Client, name: &str) -> Result<Option<String>> {
    if name.len() == 32 && name.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Ok(Some(name.to_ascii_lowercase()));
    }
    if name.is_empty() || name.len() > 16 || !name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_') {
        return Err(Error::msg("Enter an exact Minecraft username."));
    }
    let Ok(response) = send(client.get(format!(
        "https://api.minecraftservices.com/minecraft/profile/lookup/name/{name}"
    )))
    .await
    else {
        return Ok(None);
    };
    match response.status().as_u16() {
        200 => Ok(response_json(response).await?["id"]
            .as_str()
            .filter(|id| id.len() == 32 && id.bytes().all(|b| b.is_ascii_hexdigit()))
            .map(str::to_ascii_lowercase)),
        404 => Err(Error::msg(format!("No Minecraft account is named {name}."))),
        _ => Ok(None),
    }
}
async fn response_json(response: reqwest::Response) -> Result<Value> {
    if response.content_length().unwrap_or(0) > 256 * 1024 {
        return Err(Error::msg("Social response too large"));
    }
    let mut stream = response.bytes_stream();
    let mut bytes = vec![];
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        if bytes.len() + chunk.len() > 256 * 1024 {
            return Err(Error::msg("Social response too large"));
        }
        bytes.extend(chunk);
    }
    serde_json::from_slice(&bytes)
        .map_err(|_| Error::msg("The friends service returned an unexpected response. Try again later."))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn signs_proofs_with_mojang_style_pkcs8_keys() {
        // A PKCS#8 RSA-2048 key, wrapped in the "RSA PRIVATE KEY" label Mojang uses.
        let pkcs8 = include_str!("../tests/fixtures/social-test-key.pk8.b64").trim();
        let wrapped = format!("-----BEGIN RSA PRIVATE KEY-----\n{pkcs8}\n-----END RSA PRIVATE KEY-----\n");
        let der = pem(Some(&wrapped)).unwrap();
        let rng = ring::rand::SystemRandom::new();
        let proof = sign(&der, b"statement", &rng).unwrap();
        let key = signature::RsaKeyPair::from_pkcs8(&der).unwrap();
        signature::UnparsedPublicKey::new(&signature::RSA_PKCS1_2048_8192_SHA256, key.public().as_ref())
            .verify(b"statement", &proof)
            .unwrap();
        assert!(pem(None).is_err());
    }
}
