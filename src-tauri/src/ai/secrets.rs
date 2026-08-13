use super::{config, types::ProviderId};

const SERVICE: &str = "io.novaai.code.providers";

fn entry_for_user(user: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, user)
        .map_err(|_| "No se pudo acceder al almacén seguro de Windows.".to_string())
}

fn entry(provider: ProviderId) -> Result<keyring::Entry, String> {
    entry_for_user(&config::secret_user(provider))
}

fn legacy_entry(
    provider: ProviderId,
    project_path: Option<&str>,
) -> Result<keyring::Entry, String> {
    entry_for_user(&config::legacy_secret_user(provider, project_path)?)
}

pub fn set(provider: ProviderId, _project_path: Option<&str>, value: &str) -> Result<(), String> {
    let expected = value.trim();
    if expected.is_empty() {
        return Err("La clave no puede estar vacía.".into());
    }

    let credential = entry(provider)?;
    credential
        .set_password(expected)
        .map_err(|_| "Windows no pudo guardar la clave de forma segura.".to_string())?;

    match credential.get_password() {
        Ok(saved) if saved == expected => Ok(()),
        Ok(_) => Err("Windows guardó una clave distinta. Vuelve a intentarlo.".into()),
        Err(_) => Err("Windows no pudo verificar la clave después de guardarla.".into()),
    }
}

pub fn get(provider: ProviderId, project_path: Option<&str>) -> Result<Option<String>, String> {
    match entry(provider)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) if project_path.is_some() => {
            // Migrate credentials created by versions that scoped API keys per project.
            match legacy_entry(provider, project_path)?.get_password() {
                Ok(value) => {
                    set(provider, None, &value)?;
                    let _ = legacy_entry(provider, project_path)?.delete_credential();
                    Ok(Some(value))
                }
                Err(keyring::Error::NoEntry) => Ok(None),
                Err(_) => Err("Windows no pudo leer la clave guardada.".into()),
            }
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("Windows no pudo leer la clave guardada.".into()),
    }
}

pub fn delete(provider: ProviderId, project_path: Option<&str>) -> Result<(), String> {
    match entry(provider)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => {}
        Err(_) => return Err("Windows no pudo eliminar la clave guardada.".into()),
    }

    if project_path.is_some() {
        match legacy_entry(provider, project_path)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(_) => {
                return Err("Windows no pudo eliminar una clave anterior del proyecto.".into())
            }
        }
    }
    Ok(())
}
