use super::types::{AiSettings, ProviderConfig, ProviderId};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};

fn scope_id(project_path: Option<&str>) -> Result<String, String> {
    match project_path {
        Some(path) => {
            let canonical = Path::new(path)
                .canonicalize()
                .map_err(|_| "El proyecto ya no existe o no es accesible.".to_string())?;
            if !canonical.is_dir() {
                return Err("La ruta del proyecto no es una carpeta.".into());
            }
            Ok(hex::encode(Sha256::digest(
                canonical.to_string_lossy().as_bytes(),
            )))
        }
        None => Ok("global".into()),
    }
}

fn settings_path(app: &AppHandle, project_path: Option<&str>) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("No se pudo abrir la configuración: {error}"))?
        .join("providers");
    fs::create_dir_all(&directory)
        .map_err(|error| format!("No se pudo preparar la configuración: {error}"))?;
    Ok(directory.join(format!("{}.json", scope_id(project_path)?)))
}

pub fn secret_user(provider: ProviderId) -> String {
    format!("global:{}", provider.as_str())
}

pub fn legacy_secret_user(
    provider: ProviderId,
    project_path: Option<&str>,
) -> Result<String, String> {
    Ok(format!("{}:{}", scope_id(project_path)?, provider.as_str()))
}

pub fn load(app: &AppHandle, project_path: Option<&str>) -> Result<AiSettings, String> {
    let path = settings_path(app, project_path)?;
    if !path.exists() {
        return Ok(AiSettings::default());
    }
    let bytes =
        fs::read(path).map_err(|error| format!("No se pudo leer la configuración: {error}"))?;
    let mut settings: AiSettings = serde_json::from_slice(&bytes)
        .map_err(|_| "La configuración de proveedores está dañada.".to_string())?;
    merge_defaults(&mut settings);
    Ok(settings)
}

fn merge_defaults(settings: &mut AiSettings) {
    for provider in [
        ProviderId::Ollama,
        ProviderId::LmStudio,
        ProviderId::OpenAi,
        ProviderId::Anthropic,
        ProviderId::Gemini,
        ProviderId::Nvidia,
        ProviderId::Zai,
        ProviderId::Custom,
    ] {
        if let Some(item) = settings
            .providers
            .iter_mut()
            .find(|item| item.provider == provider)
        {
            // Migra solamente los valores que eran los valores predeterminados antiguos.
            // Un valor distinto se considera una elección explícita del usuario.
            let legacy_timeout = if provider.is_local() { 90 } else { 30 };
            if item.first_response_timeout_secs == legacy_timeout {
                item.first_response_timeout_secs =
                    ProviderConfig::defaults(provider).first_response_timeout_secs;
            }
        } else {
            settings.providers.push(ProviderConfig::defaults(provider));
        }
    }
}

pub fn save(
    app: &AppHandle,
    project_path: Option<&str>,
    settings: &AiSettings,
) -> Result<(), String> {
    let path = settings_path(app, project_path)?;
    let parent = path
        .parent()
        .ok_or_else(|| "No se pudo determinar la carpeta de configuración.".to_string())?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent)
        .map_err(|error| format!("No se pudo preparar el guardado: {error}"))?;
    serde_json::to_writer_pretty(&mut temporary, settings)
        .map_err(|error| format!("No se pudo serializar la configuración: {error}"))?;
    temporary
        .persist(path)
        .map_err(|error| format!("No se pudo guardar la configuración: {}", error.error))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_keys_use_a_stable_global_credential() {
        assert_eq!(secret_user(ProviderId::Nvidia), "global:nvidia");
        assert_eq!(
            secret_user(ProviderId::Nvidia),
            secret_user(ProviderId::Nvidia)
        );
    }

    #[test]
    fn migrates_only_the_old_default_start_timeout() {
        let mut settings = AiSettings {
            active_provider: None,
            providers: vec![ProviderConfig::defaults(ProviderId::Nvidia)],
        };
        settings.providers[0].first_response_timeout_secs = 30;
        merge_defaults(&mut settings);
        assert_eq!(
            settings
                .providers
                .iter()
                .find(|item| item.provider == ProviderId::Nvidia)
                .unwrap()
                .first_response_timeout_secs,
            90
        );

        let mut custom = AiSettings {
            active_provider: None,
            providers: vec![ProviderConfig::defaults(ProviderId::Nvidia)],
        };
        custom.providers[0].first_response_timeout_secs = 45;
        merge_defaults(&mut custom);
        assert_eq!(
            custom
                .providers
                .iter()
                .find(|item| item.provider == ProviderId::Nvidia)
                .unwrap()
                .first_response_timeout_secs,
            45
        );
    }
}
