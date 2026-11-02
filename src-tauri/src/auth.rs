use crate::Message;
use crate::{
    state::{secret_get, secret_set, Account},
    Error, Result,
};
use futures_util::StreamExt;
use serde_json::{json, Value};
const MS: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0";
const SCOPE: &str = "XboxLive.signin offline_access";
pub async fn start(c: &reqwest::Client, id: &str) -> Result<Value> {
    if uuid::Uuid::parse_str(id).is_err() {
        return Err(Error::msg("Add your Microsoft application's public client ID in Settings. See README → Authentication setup."));
    }
    let v: Value = c
        .post(format!("{MS}/devicecode"))
        .form(&[("client_id", id), ("scope", SCOPE)])
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    Ok(v)
}
pub async fn poll(c: &reqwest::Client, id: &str, code: &str) -> Result<Option<(Account, Value)>> {
    let r: Value = c
        .post(format!("{MS}/token"))
        .form(&[
            ("client_id", id),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ("device_code", code),
        ])
        .send()
        .await?
        .json()
        .await?;
    if r["error"] == "authorization_pending" {
        return Ok(None);
    }
    if r["error"] == "slow_down" {
        return Err(Error::msg("slow_down"));
    }
    if r.get("error").is_some() {
        return Err(Error::msg(
            r["error_description"]
                .as_str()
                .unwrap_or("Microsoft login failed"),
        ));
    }
    Ok(Some(exchange(c, r, id).await?))
}
async fn exchange(c: &reqwest::Client, mut ms: Value, client_id: &str) -> Result<(Account, Value)> {
    let token = ms["access_token"]
        .as_str()
        .ok_or_else(|| Error::msg("Microsoft did not return an access token"))?;
    let xbox:Value=c.post("https://user.auth.xboxlive.com/user/authenticate").json(&json!({"Properties":{"AuthMethod":"RPS","SiteName":"user.auth.xboxlive.com","RpsTicket":format!("d={token}")},"RelyingParty":"http://auth.xboxlive.com","TokenType":"JWT"})).send().await?.error_for_status()?.json().await?;
    let response=c.post("https://xsts.auth.xboxlive.com/xsts/authorize").json(&json!({"Properties":{"SandboxId":"RETAIL","UserTokens":[xbox["Token"]]},"RelyingParty":"rp://api.minecraftservices.com/","TokenType":"JWT"})).send().await?;
    if !response.status().is_success() {
        return Err(Error::msg("Xbox authorization failed. Check that your Microsoft account has an Xbox profile and that family permissions allow Minecraft."));
    }
    let xsts: Value = response.json().await?;
    let uhs = xsts["DisplayClaims"]["xui"][0]["uhs"]
        .as_str()
        .ok_or_else(|| Error::msg("Xbox identity missing"))?;
    let xt = xsts["Token"]
        .as_str()
        .ok_or_else(|| Error::msg("Xbox token missing"))?;
    let response = c
        .post("https://api.minecraftservices.com/authentication/login_with_xbox")
        .json(&json!({"identityToken":format!("XBL3.0 x={uhs};{xt}")}))
        .send()
        .await?;
    let status = response.status().as_u16();
    let mc = response_json(response).await?;
    if !(200..300).contains(&status) {
        return Err(Error::msg(
            minecraft_login_error(status, &mc)
                .replace(crate::state::microsoft_client_id(), client_id),
        ));
    }
    let access = mc["access_token"].as_str().ok_or_else(|| {
        Error::msg(
            "Minecraft access token missing. Verify this application's Minecraft API approval.",
        )
    })?;
    let ownership: Value = c
        .get("https://api.minecraftservices.com/entitlements/mcstore")
        .bearer_auth(access)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    if !owns_java(&ownership) {
        return Err(Error::msg(
            "This account does not have a Minecraft Java entitlement.",
        ));
    }
    let p: Value = c
        .get("https://api.minecraftservices.com/minecraft/profile")
        .bearer_auth(access)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let account = Account {
        id: p["id"]
            .as_str()
            .ok_or_else(|| Error::msg("Minecraft profile missing"))?
            .into(),
        name: p["name"].as_str().unwrap_or("Player").into(),
        skin: p["skins"][0]["url"].as_str().map(|u| {
            u.replacen(
                "http://textures.minecraft.net/",
                "https://textures.minecraft.net/",
                1,
            )
        }),
        capes: p["capes"].as_array().cloned().unwrap_or_default(),
    };
    ms["minecraft"] = mc;
    Ok((account, ms))
}
pub async fn access(c: &reqwest::Client, client_id: &str, account: &str) -> Result<String> {
    let saved: Value = serde_json::from_str(&secret_get(account)?)?;
    let refresh = saved["refresh_token"]
        .as_str()
        .ok_or_else(|| Error::msg("Please sign in again"))?;
    let mut ms: Value = c
        .post(format!("{MS}/token"))
        .form(&[
            ("client_id", client_id),
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh),
            ("scope", SCOPE),
        ])
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    if ms.get("refresh_token").is_none() {
        ms["refresh_token"] = json!(refresh);
    }
    let (a, tokens) = exchange(c, ms, client_id).await?;
    if a.id != account {
        return Err(Error::msg("Account identity changed; please sign in again"));
    }
    secret_set(account, &tokens.to_string())?;
    Ok(tokens["minecraft"]["access_token"]
        .as_str()
        .ok_or_else(|| Error::msg("Please sign in again"))?
        .into())
}

// Never include upstream bodies, identity tokens or request headers in login errors.
async fn response_json(response: reqwest::Response) -> Result<Value> {
    let mut stream = response.bytes_stream();
    let mut bytes = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        if bytes.len() + chunk.len() > 65536 {
            return Err(Error::msg("Authentication response exceeds size limit"));
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}
fn minecraft_login_error(status: u16, body: &Value) -> String {
    let reason = body["errorMessage"].as_str().unwrap_or("").to_lowercase();
    if status == 403 {
        let detail = if reason.contains("app registration") {
            "Minecraft rejected this application's registration."
        } else {
            "Minecraft Services refused the Xbox token exchange."
        };
        return format!("AR_AUTH_APP_APPROVAL: {detail} Microsoft sign-in succeeded, but AR Client may require Mojang's Minecraft API approval. The project owner must review app ID {} at https://aka.ms/mce-reviewappid. This cannot be fixed by reinstalling Minecraft or changing your password. HTTP 403.", crate::state::microsoft_client_id());
    }
    match status {
        401 => "Minecraft rejected the Xbox session. Sign in again with the Microsoft account that owns Java Edition. HTTP 401.".into(),
        429 => "Minecraft Services is rate limiting sign-in. Wait a few minutes before trying again. HTTP 429.".into(),
        500..=599 => "Minecraft Services is temporarily unavailable. Try again later.".into(),
        _ => format!("Minecraft sign-in failed (HTTP {status}). No account was saved. Try signing in again."),
    }
}
fn owns_java(value: &Value) -> bool {
    value["items"].as_array().is_some_and(|items| {
        items.iter().any(|item| {
            matches!(
                item["name"].as_str(),
                Some("game_minecraft" | "product_minecraft")
            )
        })
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn registration_rejection_is_actionable_and_never_echoes_tokens() {
        let error = minecraft_login_error(
            403,
            &json!({"errorMessage":"Invalid app registration secret-token", "access_token":"secret-token"}),
        );
        assert!(error.contains("AR_AUTH_APP_APPROVAL"));
        assert!(error.contains("https://aka.ms/mce-reviewappid"));
        assert!(!error.contains("secret-token"));
        assert!(minecraft_login_error(403, &Value::Null).contains("HTTP 403"));
    }
    #[test]
    fn only_java_entitlements_grant_ownership() {
        assert!(owns_java(&json!({"items":[{"name":"game_minecraft"}]})));
        assert!(owns_java(&json!({"items":[{"name":"product_minecraft"}]})));
        assert!(!owns_java(&json!({"items":[{"name":"unrelated"}]})));
        assert!(!owns_java(&Value::Null));
    }
    #[test]
    fn transient_errors_do_not_claim_registration_failure() {
        for status in [401, 429, 500, 502] {
            assert!(!minecraft_login_error(status, &Value::Null).contains("AR_AUTH_APP_APPROVAL"));
        }
    }
}
