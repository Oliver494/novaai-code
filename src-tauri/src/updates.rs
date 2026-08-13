use futures_util::StreamExt;
use reqwest::{redirect::Policy, Client, StatusCode};
use semver::Version;
use serde::{Deserialize, Serialize};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use url::Url;

const RELEASES_API: &str =
    "https://api.github.com/repos/Oliver494/novaai-code/releases?per_page=30";
const RELEASE_PATH_PREFIX: &str = "/Oliver494/novaai-code/releases/";
const DOWNLOAD_PATH_PREFIX: &str = "/Oliver494/novaai-code/releases/download/";
const MAX_RESPONSE_BYTES: usize = 512 * 1024;

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UpdateChannel {
    Stable,
    Experimental,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateRelease {
    version: String,
    tag: String,
    title: String,
    notes: String,
    url: String,
    asset_url: Option<String>,
    prerelease: bool,
    published_at: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    status: String,
    installed_version: String,
    checked_at: u64,
    message: String,
    release: Option<UpdateRelease>,
}

#[derive(Debug, Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    name: Option<String>,
    body: Option<String>,
    html_url: String,
    draft: bool,
    prerelease: bool,
    published_at: Option<String>,
    #[serde(default)]
    assets: Vec<GitHubAsset>,
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn result(
    status: &str,
    installed: &str,
    message: &str,
    release: Option<UpdateRelease>,
) -> UpdateCheckResult {
    UpdateCheckResult {
        status: status.into(),
        installed_version: installed.into(),
        checked_at: now_millis(),
        message: message.into(),
        release,
    }
}

fn parse_version(value: &str) -> Option<Version> {
    Version::parse(value.trim().trim_start_matches(['v', 'V'])).ok()
}

fn is_official_release_url(value: &str) -> bool {
    Url::parse(value).is_ok_and(|url| {
        url.scheme() == "https"
            && url.host_str() == Some("github.com")
            && url.path().starts_with(RELEASE_PATH_PREFIX)
            && url.username().is_empty()
            && url.password().is_none()
    })
}

fn is_official_download_url(value: &str) -> bool {
    Url::parse(value).is_ok_and(|url| {
        url.scheme() == "https"
            && url.host_str() == Some("github.com")
            && url.path().starts_with(DOWNLOAD_PATH_PREFIX)
            && url.username().is_empty()
            && url.password().is_none()
    })
}

fn select_release(
    body: &[u8],
    installed: &str,
    channel: UpdateChannel,
) -> Result<Option<UpdateRelease>, ()> {
    let releases: Vec<GitHubRelease> = serde_json::from_slice(body).map_err(|_| ())?;
    let installed_version = parse_version(installed).ok_or(())?;
    let mut eligible = releases
        .into_iter()
        .filter(|release| !release.draft)
        .filter(|release| matches!(channel, UpdateChannel::Experimental) || !release.prerelease)
        .filter_map(|release| parse_version(&release.tag_name).map(|version| (version, release)))
        .filter(|(version, _)| version > &installed_version)
        .collect::<Vec<_>>();
    eligible.sort_by(|left, right| right.0.cmp(&left.0));
    let Some((version, release)) = eligible.into_iter().next() else {
        return Ok(None);
    };
    if !is_official_release_url(&release.html_url) {
        return Err(());
    }
    let asset_url = release
        .assets
        .iter()
        .filter(|asset| {
            let name = asset.name.to_ascii_lowercase();
            name.ends_with(".exe")
                && name.contains("x64")
                && is_official_download_url(&asset.browser_download_url)
        })
        .map(|asset| asset.browser_download_url.clone())
        .next();
    let notes = release
        .body
        .unwrap_or_default()
        .chars()
        .take(1_000)
        .collect();
    Ok(Some(UpdateRelease {
        version: version.to_string(),
        tag: release.tag_name.clone(),
        title: release.name.unwrap_or(release.tag_name),
        notes,
        url: release.html_url,
        asset_url,
        prerelease: release.prerelease,
        published_at: release.published_at,
    }))
}

async fn fetch_releases(
    endpoint: &str,
    installed: &str,
    channel: UpdateChannel,
    timeout: Duration,
) -> UpdateCheckResult {
    let client = match Client::builder()
        .connect_timeout(Duration::from_secs(4))
        .timeout(timeout)
        .redirect(Policy::none())
        .user_agent("NovaAI-Code-Update-Checker")
        .build()
    {
        Ok(client) => client,
        Err(_) => {
            return result(
                "invalid_response",
                installed,
                "No se pudo preparar la comprobación.",
                None,
            )
        }
    };
    let response = match client
        .get(endpoint)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) if error.is_timeout() => {
            return result(
                "timeout",
                installed,
                "GitHub tardó demasiado en responder.",
                None,
            )
        }
        Err(error) if error.is_connect() => {
            return result("offline", installed, "No hay conexión con GitHub.", None)
        }
        Err(_) => {
            return result(
                "github_unavailable",
                installed,
                "GitHub no está disponible temporalmente.",
                None,
            )
        }
    };
    if response.status() == StatusCode::NOT_FOUND {
        return result(
            "repository_inaccessible",
            installed,
            "El canal de actualizaciones todavía no está disponible públicamente.",
            None,
        );
    }
    if !response.status().is_success() {
        return result(
            "github_unavailable",
            installed,
            "GitHub no pudo completar la comprobación.",
            None,
        );
    }
    if response
        .content_length()
        .is_some_and(|size| size > MAX_RESPONSE_BYTES as u64)
    {
        return result(
            "invalid_response",
            installed,
            "GitHub devolvió una respuesta demasiado grande.",
            None,
        );
    }
    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let Ok(chunk) = chunk else {
            return result(
                "github_unavailable",
                installed,
                "La conexión con GitHub se interrumpió.",
                None,
            );
        };
        if bytes.len() + chunk.len() > MAX_RESPONSE_BYTES {
            return result(
                "invalid_response",
                installed,
                "GitHub devolvió una respuesta demasiado grande.",
                None,
            );
        }
        bytes.extend_from_slice(&chunk);
    }
    match select_release(&bytes, installed, channel) {
        Ok(Some(release)) => result(
            "update_available",
            installed,
            "Hay una nueva versión disponible.",
            Some(release),
        ),
        Ok(None) => result(
            "up_to_date",
            installed,
            "NovaAI Code está actualizado.",
            None,
        ),
        Err(()) => result(
            "invalid_response",
            installed,
            "GitHub devolvió información de versión no válida.",
            None,
        ),
    }
}

#[tauri::command]
pub async fn check_for_updates(app: AppHandle, channel: UpdateChannel) -> UpdateCheckResult {
    let installed = app.package_info().version.to_string();
    fetch_releases(RELEASES_API, &installed, channel, Duration::from_secs(8)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };

    fn releases_json() -> Vec<u8> {
        br#"[
          {"tag_name":"v9.0.0","name":"Draft","body":"","html_url":"https://github.com/Oliver494/novaai-code/releases/tag/v9.0.0","draft":true,"prerelease":false,"published_at":null,"assets":[]},
          {"tag_name":"v0.1.1","name":"Same","body":"","html_url":"https://github.com/Oliver494/novaai-code/releases/tag/v0.1.1","draft":false,"prerelease":false,"published_at":null,"assets":[]},
          {"tag_name":"v0.2.0-beta.1","name":"Beta","body":"Preview","html_url":"https://github.com/Oliver494/novaai-code/releases/tag/v0.2.0-beta.1","draft":false,"prerelease":true,"published_at":null,"assets":[]},
          {"tag_name":"v0.1.2","name":"Update","body":"Changes","html_url":"https://github.com/Oliver494/novaai-code/releases/tag/v0.1.2","draft":false,"prerelease":false,"published_at":null,"assets":[{"name":"NovaAI.Code_0.1.2_x64-setup.exe","browser_download_url":"https://github.com/Oliver494/novaai-code/releases/download/v0.1.2/NovaAI.Code_0.1.2_x64-setup.exe"}]}
        ]"#.to_vec()
    }

    async fn mock_server(status: &str, body: &[u8], delay: Duration) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let status = status.to_string();
        let body = body.to_vec();
        tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = [0_u8; 1024];
            let _ = socket.read(&mut request).await;
            tokio::time::sleep(delay).await;
            let headers = format!(
                "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            let _ = socket.write_all(headers.as_bytes()).await;
            let _ = socket.write_all(&body).await;
        });
        format!("http://{address}/releases")
    }

    #[test]
    fn semver_compares_equal_older_and_newer_versions() {
        assert!(parse_version("v0.1.1") == parse_version("0.1.1"));
        assert!(parse_version("0.1.0") < parse_version("0.1.1"));
        assert!(parse_version("0.1.2") > parse_version("0.1.1"));
    }

    #[test]
    fn stable_ignores_prereleases_and_experimental_accepts_them() {
        let stable = select_release(&releases_json(), "0.1.1", UpdateChannel::Stable)
            .unwrap()
            .unwrap();
        let experimental = select_release(&releases_json(), "0.1.1", UpdateChannel::Experimental)
            .unwrap()
            .unwrap();
        assert_eq!(stable.version, "0.1.2");
        assert_eq!(experimental.version, "0.2.0-beta.1");
    }

    #[test]
    fn same_or_older_release_is_not_an_update() {
        assert!(
            select_release(&releases_json(), "0.2.0", UpdateChannel::Stable)
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn only_official_release_and_download_urls_are_allowed() {
        assert!(is_official_release_url(
            "https://github.com/Oliver494/novaai-code/releases/tag/v0.1.2"
        ));
        assert!(is_official_download_url("https://github.com/Oliver494/novaai-code/releases/download/v0.1.2/NovaAI.Code_0.1.2_x64-setup.exe"));
        assert!(!is_official_release_url(
            "https://example.com/Oliver494/novaai-code/releases/tag/v0.1.2"
        ));
        assert!(!is_official_download_url(
            "https://github.com/another/repo/releases/download/v1/file.exe"
        ));
    }

    #[tokio::test]
    async fn timeout_finishes_with_a_clear_status() {
        let endpoint = mock_server("200 OK", &releases_json(), Duration::from_millis(100)).await;
        let checked = fetch_releases(
            &endpoint,
            "0.1.1",
            UpdateChannel::Stable,
            Duration::from_millis(10),
        )
        .await;
        assert_eq!(checked.status, "timeout");
    }

    #[tokio::test]
    async fn inaccessible_repository_and_invalid_response_are_classified() {
        let missing = mock_server("404 Not Found", b"{}", Duration::ZERO).await;
        assert_eq!(
            fetch_releases(
                &missing,
                "0.1.1",
                UpdateChannel::Stable,
                Duration::from_secs(1)
            )
            .await
            .status,
            "repository_inaccessible"
        );
        let invalid = mock_server("200 OK", b"not-json", Duration::ZERO).await;
        assert_eq!(
            fetch_releases(
                &invalid,
                "0.1.1",
                UpdateChannel::Stable,
                Duration::from_secs(1)
            )
            .await
            .status,
            "invalid_response"
        );
    }
}
