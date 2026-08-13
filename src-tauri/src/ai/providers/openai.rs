use crate::ai::types::{ChatMessage, ImageInput};
use serde_json::{json, Value};

pub const MODELS_PATH: &str = "/models";
pub const CHAT_PATH: &str = "/responses";

pub fn body(model: &str, messages: &[ChatMessage], images: &[ImageInput]) -> Value {
    // Failed or cancelled generations can leave an empty assistant turn in the
    // local history. The Responses API expects valid input items, so omit those
    // turns and merge consecutive messages before sending the request.
    let instructions = messages
        .iter()
        .filter(|message| message.role == "system")
        .map(|message| message.content.trim())
        .filter(|content| !content.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");
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

    let mut input = normalized
        .iter()
        .map(|message| serde_json::to_value(message).unwrap_or_else(|_| json!({})))
        .collect::<Vec<_>>();
    if !images.is_empty() {
        if let Some(last) = input.iter_mut().rev().find(|item| item["role"] == "user") {
            let text = last["content"].as_str().unwrap_or_default().to_string();
            let mut parts = Vec::new();
            if !text.trim().is_empty() {
                parts.push(json!({"type":"input_text","text":text}));
            }
            parts.extend(images.iter().map(|image| json!({"type":"input_image","image_url":format!("data:{};base64,{}", image.mime_type, image.base64)})));
            last["content"] = Value::Array(parts);
        }
    }
    let mut payload = json!({ "model": model, "input": input, "stream": true, "store": false });
    if !instructions.is_empty() {
        payload["instructions"] = Value::String(instructions);
    }
    payload
}

pub fn parse(value: &Value) -> (Option<String>, bool) {
    let event = value.get("type").and_then(Value::as_str).unwrap_or("");
    (
        if event == "response.output_text.delta" {
            value
                .get("delta")
                .and_then(Value::as_str)
                .map(str::to_string)
        } else {
            None
        },
        event == "response.completed",
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removes_empty_history_and_sends_system_as_instructions() {
        let messages = vec![
            ChatMessage {
                role: "system".into(),
                content: "Responde en español".into(),
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
        let payload = body("gpt-test", &messages, &[]);
        assert_eq!(
            payload.get("instructions").and_then(Value::as_str),
            Some("Responde en español")
        );
        let input = payload.get("input").and_then(Value::as_array).unwrap();
        assert_eq!(input.len(), 1);
        assert_eq!(input[0].get("role").and_then(Value::as_str), Some("user"));
        assert_eq!(
            input[0].get("content").and_then(Value::as_str),
            Some("Primera pregunta\n\nhola")
        );
    }

    #[test]
    fn image_only_turn_does_not_send_an_empty_text_part() {
        let messages = vec![ChatMessage {
            role: "user".into(),
            content: "".into(),
        }];
        let images = vec![ImageInput {
            mime_type: "image/png".into(),
            base64: "abc".into(),
        }];
        let payload = body("gpt-test", &messages, &images);
        let parts = payload
            .pointer("/input/0/content")
            .and_then(Value::as_array)
            .unwrap();
        assert_eq!(parts.len(), 1);
        assert_eq!(
            parts[0].get("type").and_then(Value::as_str),
            Some("input_image")
        );
    }
}
