use reqwest::StatusCode;
use serde::Serialize;
use serde_json::Value;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    pub code: String,
    pub title: String,
    pub explanation: String,
    pub cause: String,
    pub action: String,
    pub technical_details: Option<String>,
    pub retryable: bool,
}

impl Diagnostic {
    pub fn new(
        code: &str,
        title: impl Into<String>,
        explanation: impl Into<String>,
        cause: impl Into<String>,
        action: impl Into<String>,
        retryable: bool,
    ) -> Self {
        Self {
            code: code.into(),
            title: title.into(),
            explanation: explanation.into(),
            cause: cause.into(),
            action: action.into(),
            technical_details: None,
            retryable,
        }
    }

    pub fn technical(mut self, details: impl Into<String>) -> Self {
        let text = details.into();
        self.technical_details = Some(text.chars().take(1200).collect());
        self
    }
}

pub fn connection_error(provider: &str, endpoint: &str, error: &reqwest::Error) -> Diagnostic {
    if error.is_timeout() {
        return Diagnostic::new(
            "REQUEST_TIMEOUT",
            "La conexión tardó demasiado",
            format!("{provider} no respondió dentro del tiempo configurado."),
            "El servidor está ocupado, apagado o la red es lenta.",
            "Comprueba el servidor y vuelve a intentarlo.",
            true,
        );
    }
    if error.is_connect() {
        return Diagnostic::new(
            "CONNECTION_REFUSED",
            format!("No se puede conectar con {provider}"),
            format!("No encontramos un servidor en {endpoint}."),
            "El servidor puede estar apagado o el endpoint no es correcto.",
            "Inicia el servidor o revisa el endpoint y vuelve a probar.",
            true,
        );
    }
    Diagnostic::new(
        "CONNECTION_LOST",
        "Se perdió la conexión",
        format!("La comunicación con {provider} se interrumpió."),
        "La red o el servidor cerró la conexión.",
        "Comprueba la conexión y reintenta.",
        true,
    )
    .technical(error.to_string())
}

pub fn http_error(status: StatusCode, body: &str, provider: &str) -> Diagnostic {
    let lower = body.to_ascii_lowercase();
    let mentions_images = lower.contains("image")
        || lower.contains("vision")
        || lower.contains("multimodal")
        || lower.contains("modality");
    let rejects_capability = lower.contains("not support")
        || lower.contains("doesn't support")
        || lower.contains("does not support")
        || lower.contains("unsupported")
        || lower.contains("text-only")
        || lower.contains("text only")
        || lower.contains("invalid content type");
    if status.is_client_error() && mentions_images && rejects_capability {
        return Diagnostic::new(
            "IMAGE_NOT_SUPPORTED",
            "Este modelo no puede ver imágenes",
            "El modelo seleccionado solo admite texto o no tiene la función de visión habilitada.",
            "El proveedor rechazó el contenido de imagen para este modelo.",
            "Selecciona un modelo con visión o elimina la imagen adjunta.",
            false,
        )
        .technical(redact(body));
    }
    if status.is_server_error() {
        if let Some(detail) = provider_error_message(body) {
            return Diagnostic::new(
                "PROVIDER_SERVER_ERROR",
                format!("{provider} tuvo un error temporal"),
                detail,
                "El proveedor tuvo un problema interno o estaba saturado mientras procesaba la solicitud.",
                "Espera unos segundos y reintenta. Si continúa, prueba la conexión y revisa el estado del proveedor.",
                true,
            )
            .technical(redact(body));
        }
        return Diagnostic::new(
            "PROVIDER_SERVER_ERROR",
            format!("{provider} tuvo un error temporal"),
            format!("{provider} devolvió HTTP {}. La clave y el endpoint podrían seguir siendo correctos.", status.as_u16()),
            "El proveedor tuvo un problema interno o estaba saturado mientras procesaba la solicitud.",
            "Espera unos segundos y reintenta. Si continúa, usa “Probar conexión” y revisa el estado del proveedor.",
            true,
        )
        .technical(redact(body));
    }
    if status == StatusCode::BAD_REQUEST {
        let detail = provider_error_message(body).unwrap_or_else(|| {
            "La API recibió una solicitud con un formato o parámetro no válido.".into()
        });
        return Diagnostic::new(
            "INVALID_REQUEST",
            format!("{provider} rechazó la solicitud"),
            detail,
            "La petición no coincide con los parámetros que admite el proveedor o el modelo seleccionado.",
            "Comprueba el mensaje mostrado; Nova conserva los detalles técnicos de forma segura.",
            false,
        )
        .technical(redact(body));
    }
    let (code, title, cause, action, retryable) = match status.as_u16() {
        401 => (
            "INVALID_API_KEY",
            "La clave no es válida",
            "La clave está ausente, caducada o fue revocada.",
            "Reemplaza la clave y vuelve a probar.",
            false,
        ),
        402 => (
            "QUOTA_EXCEEDED",
            "Hay un problema de facturación",
            "La cuenta no tiene saldo o un método de pago válido.",
            "Revisa la facturación del proveedor.",
            false,
        ),
        403 => (
            "AUTHENTICATION_FAILED",
            "La cuenta no tiene permiso",
            "La clave no puede acceder a este recurso o modelo.",
            "Revisa los permisos y el acceso al modelo.",
            false,
        ),
        404 if lower.contains("model")
            || (lower.contains("function") && lower.contains("not found for account")) =>
        {
            (
                "MODEL_NOT_FOUND",
                "Modelo retirado o sin acceso",
                "El proveedor no permite usar este modelo con la cuenta configurada.",
                "Prueba la conexión y selecciona uno de los modelos disponibles.",
                false,
            )
        }
        410 if lower.contains("model") || lower.contains("end of life") => (
            "MODEL_NOT_FOUND",
            "Modelo retirado",
            "Este modelo ya no está disponible en el proveedor.",
            "Selecciona un modelo vigente y vuelve a intentarlo.",
            false,
        ),
        404 => (
            "INVALID_ENDPOINT",
            "Endpoint incorrecto",
            "La ruta solicitada no existe en el servidor.",
            "Restaura el endpoint predeterminado o corrige la URL.",
            false,
        ),
        408 | 504 => (
            "RESPONSE_TIMEOUT",
            "La respuesta tardó demasiado",
            "El proveedor no terminó la solicitud a tiempo.",
            "Aumenta el timeout o reduce el contexto.",
            true,
        ),
        413 => (
            "CONTEXT_TOO_LARGE",
            "El contexto es demasiado grande",
            "La solicitud supera el tamaño permitido.",
            "Quita archivos adjuntos o reduce la conversación.",
            false,
        ),
        429 if lower.contains("quota") || lower.contains("billing") || lower.contains("credit") => {
            (
                "QUOTA_EXCEEDED",
                "Cuota agotada",
                "La cuenta alcanzó su límite de uso o saldo.",
                "Revisa la cuota y facturación del proveedor.",
                false,
            )
        }
        429 => (
            "RATE_LIMITED",
            "Demasiadas solicitudes",
            "El proveedor aplicó un límite temporal.",
            "Espera un momento y vuelve a intentarlo.",
            true,
        ),
        _ if lower.contains("context")
            && (lower.contains("large") || lower.contains("length") || lower.contains("token")) =>
        {
            (
                "CONTEXT_TOO_LARGE",
                "El contexto es demasiado grande",
                "La entrada supera la ventana del modelo.",
                "Quita archivos adjuntos o reduce la conversación.",
                false,
            )
        }
        _ => (
            "INVALID_RESPONSE",
            "El proveedor rechazó la solicitud",
            "La respuesta no coincide con lo esperado.",
            "Revisa la configuración y los detalles técnicos.",
            false,
        ),
    };
    Diagnostic::new(
        code,
        title,
        format!("{provider} respondió con HTTP {}.", status.as_u16()),
        cause,
        action,
        retryable,
    )
    .technical(redact(body))
}

fn provider_error_message(body: &str) -> Option<String> {
    let value: Value = serde_json::from_str(body).ok()?;
    value
        .pointer("/error/message")
        .or_else(|| value.get("message"))
        .and_then(Value::as_str)
        .map(redact)
        .filter(|message| !message.trim().is_empty())
        .map(|message| message.chars().take(380).collect())
}

pub fn redact(value: &str) -> String {
    let words = value
        .split_whitespace()
        .map(|part| {
            if part.starts_with("sk-") || part.starts_with("nvapi-") || part.len() > 180 {
                "[REDACTED]"
            } else {
                part
            }
        })
        .collect::<Vec<_>>()
        .join(" ");
    redact_account_identifier(&words)
}

fn redact_account_identifier(value: &str) -> String {
    let lower = value.to_ascii_lowercase();
    let Some(start) = lower.find("account '") else {
        return value.to_string();
    };
    let secret_start = start + "account '".len();
    let Some(relative_end) = value[secret_start..].find('\'') else {
        return value.to_string();
    };
    let end = secret_start + relative_end;
    format!("{}[REDACTED]{}", &value[..secret_start], &value[end..])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_auth_model_quota_and_context_errors() {
        assert_eq!(
            http_error(StatusCode::UNAUTHORIZED, "bad key", "OpenAI").code,
            "INVALID_API_KEY"
        );
        assert_eq!(
            http_error(StatusCode::NOT_FOUND, "model missing", "Ollama").code,
            "MODEL_NOT_FOUND"
        );
        assert_eq!(
            http_error(StatusCode::TOO_MANY_REQUESTS, "quota exceeded", "Gemini").code,
            "QUOTA_EXCEEDED"
        );
        assert_eq!(
            http_error(StatusCode::PAYLOAD_TOO_LARGE, "large", "Claude").code,
            "CONTEXT_TOO_LARGE"
        );
        assert_eq!(
            http_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "temporary provider issue",
                "OpenAI"
            )
            .code,
            "PROVIDER_SERVER_ERROR"
        );
        let invalid = http_error(
            StatusCode::BAD_REQUEST,
            r#"{"error":{"message":"messages.1.content must not be empty"}}"#,
            "Anthropic",
        );
        assert_eq!(invalid.code, "INVALID_REQUEST");
        assert_eq!(invalid.explanation, "messages.1.content must not be empty");

        let no_vision = http_error(
            StatusCode::BAD_REQUEST,
            r#"{"error":{"message":"This text-only model does not support image input"}}"#,
            "NVIDIA API",
        );
        assert_eq!(no_vision.code, "IMAGE_NOT_SUPPORTED");
        assert_eq!(no_vision.title, "Este modelo no puede ver imágenes");

        let server = http_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            r#"{"error":{"message":"The upstream service is overloaded"}}"#,
            "OpenAI",
        );
        assert_eq!(server.explanation, "The upstream service is overloaded");
    }

    #[test]
    fn redacts_key_like_values() {
        assert!(!redact("error sk-secret-value").contains("sk-secret-value"));
        assert!(!redact("Not found for account 'abc-123'").contains("abc-123"));
    }
}
