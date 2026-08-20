import type { ChatMessage } from "../types";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const ACTION_VERB = /\b(?:crea(?:r|me|melo|mela|lo|la)?|haz(?:me|melo|mela|lo|la)?|hacer|realiza(?:r|lo|la)?|genera(?:r|me|lo|la)?|construye|desarrolla|mejora(?:r|lo|la)?|cambia(?:r|lo|la)?|adapta(?:r|lo|la)?|transforma(?:r|lo|la)?|refactoriza(?:r|lo|la)?|dibuja(?:r|lo|la)?|edita(?:r|me|lo|la)?|modifica(?:r|me|lo|la)?|implementa(?:r|lo|la)?|actualiza(?:r|lo|la)?|aplica(?:r|lo|la)?|guarda(?:r|lo|la)?|escribe|escribir|inserta(?:r|lo|la)?|integra(?:r|lo|la)?|sustituye|sustituir|reemplaza(?:r|lo|la)?|pega(?:r|lo|la)?|pon(?:er)?|anade|anadir|agrega(?:r|lo|la)?|elimina(?:r|lo|la)?|borra(?:r|lo|la)?|renombra(?:r|lo|la)?|mueve|mover|arregla(?:r|lo|la)?|corrige|corregir|create|make|generate|build|develop|improve|change|adapt|transform|refactor|draw|edit|update|modify|implement|apply|save|write|insert|replace|paste|put|add|delete|remove|rename|move|fix)\b/u;

const READ_ONLY_REQUEST = /\b(?:puedes?|podrias?|puedo|ver|leer|muestra|mostrar|explora|explorar|que hay|tienes acceso|can you see|can you read|show|inspect|explain)\b/u;
const INFORMATIONAL_PREFIX = /^(?:como|que|cual|por que|explica|explicame|dime|how|what|which|why)\b/u;
const CONTINUATION = /^(?:si|hazlo|continua|sigue|adelante|ok|vale|do it|continue|go ahead)[!.\s]*$/u;

function previousActionRequest(history: Pick<ChatMessage, "role" | "content">[]) {
  return [...history].reverse().some((item) => {
    if (item.role !== "user") return false;
    const value = normalize(item.content);
    if (CONTINUATION.test(value)) return false;
    return ACTION_VERB.test(value) && !INFORMATIONAL_PREFIX.test(value);
  });
}

export function requestsProjectAction(prompt: string, history: Pick<ChatMessage, "role" | "content">[]) {
  if (/(?:\b[a-z]:[\\/]|\\\\)/i.test(prompt)) return false;
  const current = normalize(prompt).replace(/[¿?]/g, "").trim();

  // Explanatory questions may mention words such as "crear" without asking
  // Nova to modify the workspace.
  if (INFORMATIONAL_PREFIX.test(current)) return false;
  if (CONTINUATION.test(current)) {
    return previousActionRequest(history);
  }
  if (ACTION_VERB.test(current)) return true;
  if (READ_ONLY_REQUEST.test(current)) return false;
  return false;
}
