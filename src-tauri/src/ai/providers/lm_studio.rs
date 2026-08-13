use crate::ai::types::{ChatMessage, ImageInput};
use serde_json::{json, Value};

pub const MODELS_PATH: &str = "/api/v1/models";
pub const CHAT_PATH: &str = "/chat/completions";

pub fn body(model: &str, messages: &[ChatMessage], images: &[ImageInput]) -> Value {
    let mut payload = serde_json::to_value(messages).unwrap_or_else(|_| json!([]));
    if !images.is_empty() {
        if let Some(last) = payload
            .as_array_mut()
            .and_then(|items| items.iter_mut().rev().find(|item| item["role"] == "user"))
        {
            let text = last["content"].as_str().unwrap_or_default().to_string();
            let mut parts = vec![json!({"type":"text","text":text})];
            parts.extend(images.iter().map(|image| json!({"type":"image_url","image_url":{"url":format!("data:{};base64,{}", image.mime_type, image.base64)}})));
            last["content"] = Value::Array(parts);
        }
    }
    json!({ "model": model, "messages": payload, "stream": true })
}

pub fn parse(value: &Value) -> (Option<String>, bool) {
    (
        value
            .pointer("/choices/0/delta/content")
            .and_then(Value::as_str)
            .map(str::to_string),
        false,
    )
}
