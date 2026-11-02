use crate::{auth, state, Error, Message, Result};
use futures_util::StreamExt;
use serde_json::{json, Value};
use std::collections::HashMap;
use tokio::sync::Mutex;
const URL: &str = match option_env!("AR_SOCIAL_URL") {
    Some(url) => url,
    None => "https://social.client.kingar1000.xyz/",
};
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
        args: Value,
    ) -> Result<Value> {
        let endpoint = crate::net::https(URL)?;
        let action = args["action"].as_str().unwrap_or("");
        if ![
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
        ]
        .contains(&action)
        {
            return Err(Error::msg("Unknown social action"));
        }
        for attempt in 0..2 {
            let token = {
                let mut sessions = self.sessions.lock().await;
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)?
                    .as_millis() as u64;
                if sessions
                    .get(account)
                    .is_none_or(|(_, expires)| *expires <= now + 60000)
                {
                    let minecraft = auth::access(client, client_id, account).await?;
                    let response = client
                        .post(endpoint.clone())
                        .bearer_auth(minecraft)
                        .json(&json!({"action":"session"}))
                        .send()
                        .await?;
                    if !response.status().is_success() {
                        return Err(Error::msg("AR Client's friends/chat service could not establish a verified session. The project owner must finish deploying the social service; Minecraft sign-in must work first."));
                    }
                    let session = response_json(response).await?;
                    if session["id"] != account {
                        return Err(Error::msg("Social identity mismatch"));
                    }
                    let token = session["token"]
                        .as_str()
                        .filter(|s| s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit()))
                        .ok_or("Invalid social session")?;
                    let expires = session["expires"]
                        .as_u64()
                        .ok_or("Missing session expiry")?;
                    sessions.insert(account.into(), (token.into(), expires));
                }
                sessions
                    .get(account)
                    .ok_or("Social session missing")?
                    .0
                    .clone()
            };
            let response = client
                .post(endpoint.clone())
                .bearer_auth(token)
                .json(&args)
                .send()
                .await?;
            let status = response.status();
            if status.as_u16() == 401 && attempt == 0 {
                self.sessions.lock().await.remove(account);
                continue;
            }
            if response.content_length().unwrap_or(0) > 256 * 1024 {
                return Err(Error::msg("Social response too large"));
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

async fn response_json(response: reqwest::Response) -> Result<Value> {
    let mut stream = response.bytes_stream();
    let mut bytes = vec![];
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        if bytes.len() + chunk.len() > 256 * 1024 {
            return Err(Error::msg("Social response too large"));
        }
        bytes.extend(chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_|Error::msg("Friends/chat service is unavailable. The project owner must deploy the social service."))
}
