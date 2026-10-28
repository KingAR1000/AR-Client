use crate::Message;
use crate::{
    state::{secret_get, secret_set, Account},
    Error, Result,
};
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
    Ok(Some(exchange(c, r).await?))
}
async fn exchange(c: &reqwest::Client, mut ms: Value) -> Result<(Account, Value)> {
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
    let mc: Value = c
        .post("https://api.minecraftservices.com/authentication/login_with_xbox")
        .json(&json!({"identityToken":format!("XBL3.0 x={uhs};{xt}")}))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
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
    if ownership["items"].as_array().is_none_or(|i| i.is_empty()) {
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
        skin: p["skins"][0]["url"].as_str().map(str::to_owned),
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
    let (a, tokens) = exchange(c, ms).await?;
    if a.id != account {
        return Err(Error::msg("Account identity changed; please sign in again"));
    }
    secret_set(account, &tokens.to_string())?;
    Ok(tokens["minecraft"]["access_token"]
        .as_str()
        .ok_or_else(|| Error::msg("Please sign in again"))?
        .into())
}
