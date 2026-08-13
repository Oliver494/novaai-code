use crate::ai::types::{ChatMessage, ImageInput};
use serde_json::{json, Value};

pub const MODELS_PATH: &str = "/models";
pub const CHAT_PATH: &str = "/chat/completions";

pub fn is_chat_model(model: &str) -> bool {
    let name = model.to_ascii_lowercase();
    ![
        "guard",
        "safety",
        "topic-control",
        "gliner",
        "rerank",
        "embedding",
        "nemoretriever",
        "-parse",
        "-pii",
    ]
    .iter()
    .any(|excluded| name.contains(excluded))
}

fn max_tokens(model: &str) -> u64 {
    if model.to_ascii_lowercase().contains("guard") {
        30
    } else {
        // 2K is accepted by the general NVIDIA chat catalogue and leaves room
        // for the project context. Individual models can have lower hard caps.
        2048
    }
}

pub fn body(model: &str, messages: &[ChatMessage], images: &[ImageInput]) -> Value {
    // NVIDIA requires one optional system prompt at the beginning and then
    // alternating user/assistant turns. Empty assistant turns can be left by a
    // cancelled stream, so normalize the local history before sending it.
    let system = messages
        .iter()
        .filter(|message| message.role == "system" && !message.content.trim().is_empty())
        .map(|message| message.content.trim())
        .collect::<Vec<_>>()
        .join("\n\n");
    let last_user = messages.iter().rposition(|message| message.role == "user");
    let mut normalized = Vec::<ChatMessage>::new();
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
    let mut payload = Vec::new();
    if !system.is_empty() {
        payload.push(json!({"role":"system","content":system}));
    }
    payload.extend(
        normalized
            .iter()
            .map(|message| serde_json::to_value(message).unwrap_or_else(|_| json!({}))),
    );
    if !images.is_empty() {
        if let Some(last) = payload.iter_mut().rev().find(|item| item["role"] == "user") {
            let text = last["content"].as_str().unwrap_or_default().to_string();
            let mut parts = Vec::new();
            if !text.trim().is_empty() {
                parts.push(json!({"type":"text","text":text}));
            }
            parts.extend(images.iter().map(|image| json!({"type":"image_url","image_url":{"url":format!("data:{};base64,{}", image.mime_type, image.base64)}})));
            last["content"] = Value::Array(parts);
        }
    }
    json!({ "model": model, "messages": payload, "max_tokens": max_tokens(model), "stream": true })
}

pub fn parse(value: &Value) -> (Option<String>, bool) {
    (
        value
            .pointer("/choices/0/delta/content")
            .or_else(|| value.pointer("/choices/0/message/content"))
            .and_then(Value::as_str)
            .map(str::to_string),
        false,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_history_for_nvidia_chat_models() {
        let messages = vec![
            ChatMessage {
                role: "system".into(),
                content: "Regla 1".into(),
            },
            ChatMessage {
                role: "system".into(),
                content: "Regla 2".into(),
            },
            ChatMessage {
                role: "user".into(),
                content: "hola".into(),
            },
            ChatMessage {
                role: "assistant".into(),
                content: "".into(),
            },
            ChatMessage {
                role: "user".into(),
                content: "continúa".into(),
            },
        ];
        let body = body("z-ai/glm-5.2", &messages, &[]);
        let sent = body.get("messages").and_then(Value::as_array).unwrap();
        assert_eq!(sent.len(), 2);
        assert_eq!(sent[0].get("role").and_then(Value::as_str), Some("system"));
        assert_eq!(sent[1].get("role").and_then(Value::as_str), Some("user"));
        assert_eq!(
            sent[1].get("content").and_then(Value::as_str),
            Some("hola\n\ncontinúa")
        );
    }

    #[test]
    fn excludes_non_chat_catalog_entries() {
        assert!(is_chat_model("z-ai/glm-5.2"));
        assert!(!is_chat_model(
            "nvidia/llama-3.1-nemoguard-8b-content-safety"
        ));
        assert!(!is_chat_model("nvidia/gliner-pii"));
    }
}
