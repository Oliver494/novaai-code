use crate::ai::types::{ChatMessage, ImageInput};
use serde_json::{json, Value};

pub const MODELS_PATH: &str = "/api/tags";
pub const CHAT_PATH: &str = "/api/chat";

pub fn body(model: &str, messages: &[ChatMessage], images: &[ImageInput]) -> Value {
    let mut payload = serde_json::to_value(messages).unwrap_or_else(|_| json!([]));
    if !images.is_empty() {
        if let Some(last) = payload
            .as_array_mut()
            .and_then(|items| items.iter_mut().rev().find(|item| item["role"] == "user"))
        {
            last["images"] = json!(images
                .iter()
                .map(|image| image.base64.clone())
                .collect::<Vec<_>>());
        }
    }
    json!({ "model": model, "messages": payload, "stream": true })
}

pub fn parse(value: &Value) -> (Option<String>, bool) {
    (
        value
            .pointer("/message/content")
            .and_then(Value::as_str)
            .map(str::to_string),
        value.get("done").and_then(Value::as_bool).unwrap_or(false),
    )
}
