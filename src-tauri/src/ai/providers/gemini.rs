use crate::ai::types::{ChatMessage, ImageInput};
use serde_json::{json, Value};

pub const MODELS_PATH: &str = "/models?pageSize=100";

pub fn chat_path(model: &str) -> String {
    let encoded: String =
        url::form_urlencoded::byte_serialize(model.trim().trim_start_matches("models/").as_bytes())
            .collect();
    format!("/models/{encoded}:streamGenerateContent?alt=sse")
}

pub fn body(_model: &str, messages: &[ChatMessage], images: &[ImageInput]) -> Value {
    let system = messages
        .iter()
        .filter(|message| message.role == "system")
        .map(|message| message.content.as_str())
        .collect::<Vec<_>>()
        .join("\n\n");
    let mut contents = messages
        .iter()
        .filter(|message| message.role != "system")
        .map(|message| {
            json!({
                "role": if message.role == "assistant" { "model" } else { "user" },
                "parts": [{"text": message.content}]
            })
        })
        .collect::<Vec<_>>();
    if !images.is_empty() {
        if let Some(last) = contents
            .iter_mut()
            .rev()
            .find(|item| item["role"] == "user")
        {
            if let Some(parts) = last["parts"].as_array_mut() {
                parts.extend(images.iter().map(
                    |image| json!({"inlineData":{"mimeType":image.mime_type,"data":image.base64}}),
                ));
            }
        }
    }
    let mut body = json!({ "contents": contents });
    if !system.is_empty() {
        body["systemInstruction"] = json!({"parts":[{"text":system}]});
    }
    body
}

pub fn parse(value: &Value) -> (Option<String>, bool) {
    let text = value
        .pointer("/candidates/0/content/parts")
        .and_then(Value::as_array)
        .map(|parts| {
            parts
                .iter()
                .filter_map(|part| part.get("text").and_then(Value::as_str))
                .collect::<String>()
        })
        .filter(|text| !text.is_empty());
    let done = value
        .pointer("/candidates/0/finishReason")
        .and_then(Value::as_str)
        .is_some();
    (text, done)
}
