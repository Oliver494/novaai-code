import assert from "node:assert/strict";
import test from "node:test";
import { requestsProjectAction } from "../src/services/actionIntent.ts";

const history = (content: string) => [{ role: "user" as const, content }];

test("reconoce peticiones naturales para crear y editar archivos", () => {
  for (const prompt of [
    "hazme un html de login",
    "créame el archivo",
    "creame un archivo en aprender",
    "construye una página y guarda el código",
    "edítame index.html",
    "pero actualiza el html, no me des el código",
    "pon tú el código en el HTML",
    "guarda esa implementación en index.html",
    "aplica el bloque anterior al archivo",
    "realiza una reconstrucción visual completa en Canvas",
    "mejora la función de renderizado del pájaro",
    "cambia el fondo del juego",
    "arregla el proyecto",
    "make a login page",
    "fix the current file",
  ]) {
    assert.equal(requestsProjectAction(prompt, []), true, prompt);
  }
});

test("no convierte preguntas o carpetas externas en escrituras", () => {
  for (const prompt of [
    "puedes ver esta carpeta?",
    "qué archivos hay en el proyecto",
    "cómo crear un archivo html",
    "explica cómo editar index.html",
    "crea un archivo en C:\\abuela",
    "hola",
  ]) {
    assert.equal(requestsProjectAction(prompt, []), false, prompt);
  }
});

test("una continuación hereda solamente una tarea de escritura anterior", () => {
  assert.equal(requestsProjectAction("continúa", history("hazme un html")), true);
  assert.equal(requestsProjectAction("hazlo", history("puedes ver el proyecto")), false);
  assert.equal(requestsProjectAction("continúa", [
    { role: "user", content: "actualiza index.html" },
    { role: "assistant", content: "Necesito confirmar el formato" },
    { role: "user", content: "sí" },
  ]), true);
});
