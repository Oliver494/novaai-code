import assert from "node:assert/strict";
import test from "node:test";
import { forgetProject, loadProjects, rememberProject } from "../src/services/projects.ts";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

function resetStorage() {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: new MemoryStorage() });
}

test("guarda varios proyectos en orden alfabético estable", () => {
  resetStorage();
  let projects = rememberProject([], { name: "Uno", path: "C:\\Uno" });
  projects = rememberProject(projects, { name: "Dos", path: "D:\\Dos" });
  assert.deepEqual(projects.map((item) => item.name), ["Dos", "Uno"]);
  projects = rememberProject(projects, { name: "Árbol", path: "E:\\Arbol" });
  assert.deepEqual(projects.map((item) => item.name), ["Árbol", "Dos", "Uno"]);
  projects = rememberProject(projects, { name: "Dos", path: "D:\\Dos" });
  assert.deepEqual(projects.map((item) => item.name), ["Árbol", "Dos", "Uno"]);
  assert.deepEqual(loadProjects(), projects);
});

test("evita duplicados aunque cambien mayúsculas o la barra final", () => {
  resetStorage();
  let projects = rememberProject([], { name: "Anterior", path: "C:\\Codigo\\Nova\\" });
  projects = rememberProject(projects, { name: "Nova", path: "c:\\codigo\\nova" });
  assert.equal(projects.length, 1);
  assert.equal(projects[0].name, "Nova");
});

test("quitar un proyecto solo modifica el registro local", () => {
  resetStorage();
  const projects = rememberProject([{ name: "Uno", path: "C:\\Uno" }], { name: "Dos", path: "D:\\Dos" });
  const remaining = forgetProject(projects, "c:\\uno");
  assert.deepEqual(remaining, [{ name: "Dos", path: "D:\\Dos" }]);
  assert.deepEqual(loadProjects(), remaining);
});
