use crate::ai::types::{ChatMessage, ImageInput};
use serde_json::{json, Value};

pub const MODELS_PATH: &str = "/models";
pub const CHAT_PATH: &str = "/messages";

pub fn body(model: &str, messages: &[ChatMessage], images: &[ImageInput]) -> Value {
    let system = messages
        .iter()
        .filter(|message| message.role == "system")
        .map(|message| message.content.as_str())
        .collect::<Vec<_>>()
        .join("\n\n");
    // Anthropic no acepta bloques de texto vacíos. Una generación interrumpida
    // puede dejar un mensaje de asistente vacío en el historial, así que lo
    // omitimos y fusionamos turnos consecutivos del mismo rol.
    let last_user = messages.iter().rposition(|message| message.role == "user");
    let mut normalized: Vec<ChatMessage> = Vec::new();
    for (index, message) in messages
        .iter()
        .enumerate()
        .filter(|(_, message)| message.role != "system")
    {
        let is_image_turn =
            !images.is_empty() && Some(index) == last_user && message.role == "user";
        if message.content.trim().is_empty() && !is_image_turn {
            continue;
        }
        if let Some(previous) = normalized
            .last_mut()
            .filter(|previous| previous.role == message.role)
        {
            if !message.content.trim().is_empty() {
                if !previous.content.is_empty() {
                    previous.content.push_str("\n\n");
                }
                previous.content.push_str(&message.content);
            }
        } else {
            normalized.push(message.clone());
        }
    }
    let mut filtered = normalized
        .iter()
        .map(|message| serde_json::to_value(message).unwrap())
        .collect::<Vec<_>>();
    if !images.is_empty() {
        if let Some(last) = filtered
            .iter_mut()
            .rev()
            .find(|item| item["role"] == "user")
        {
            let text = last["content"].as_str().unwrap_or_default().to_string();
            let mut parts = Vec::new();
            if !text.trim().is_empty() {
                parts.push(json!({"type":"text","text":text}));
            }
            parts.extend(images.iter().map(|image| json!({"type":"image","source":{"type":"base64","media_type":image.mime_type,"data":image.base64}})));
            last["content"] = Value::Array(parts);
        }
    }
    json!({ "model": model, "system": system, "messages": filtered, "max_tokens": 4096, "stream": true })
}

pub fn parse(value: &Value) -> (Option<String>, bool) {
    let event = value.get("type").and_then(Value::as_str).unwrap_or("");
    (
        if event == "content_block_delta" {
            value
                .pointer("/delta/text")
                .and_then(Value::as_str)
                .map(str::to_string)
        } else {
            None
        },
        event == "message_stop",
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn omits_empty_messages_left_by_failed_generations() {
        let messages = vec![
            ChatMessage {
                role: "system".into(),
                content: "Reglas".into(),
            },
            ChatMessage {
                role: "user".into(),
                content: "Primera pregunta".into(),
            },
            ChatMessage {
                role: "assistant".into(),
                content: "".into(),
            },
            ChatMessage {
                role: "user".into(),
                content: "hola".into(),
            },
        ];
        let body = body("claude-test", &messages, &[]);
        let sent = body.get("messages").and_then(Value::as_array).unwrap();
        assert_eq!(sent.len(), 1);
        assert_eq!(sent[0].get("role").and_then(Value::as_str), Some("user"));
        assert_eq!(
            sent[0].get("content").and_then(Value::as_str),
            Some("Primera pregunta\n\nhola")
        );
    }

    #[test]
    fn image_only_turn_does_not_create_an_empty_text_block() {
        let messages = vec![ChatMessage {
            role: "user".into(),
            content: "".into(),
        }];
        let images = vec![ImageInput {
            mime_type: "image/png".into(),
            base64: "abc".into(),
        }];
        let body = body("claude-test", &messages, &images);
        let parts = body
            .pointer("/messages/0/content")
            .and_then(Value::as_array)
            .unwrap();
        assert_eq!(parts.len(), 1);
        assert_eq!(parts[0].get("type").and_then(Value::as_str), Some("image"));
    }
}
