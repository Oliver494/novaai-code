use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use ignore::gitignore::{Gitignore, GitignoreBuilder};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
};
use tempfile::NamedTempFile;

mod ai;
mod agent;

const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_TREE_DEPTH: usize = 32;
const MAX_TREE_ENTRIES: usize = 20_000;
const ALWAYS_IGNORED: &[&str] = &[
    ".git",
    "node_modules",
    "dist",
    "build",
    "target",
    ".cache",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".next",
    ".nuxt",
    ".idea",
    ".vscode",
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectInfo {
    name: String,
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileNode {
    name: String,
    path: String,
    relative_path: String,
    is_directory: bool,
    children: Vec<FileNode>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileContent {
    pub(crate) path: String,
    pub(crate) relative_path: String,
    pub(crate) content: String,
    pub(crate) size: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LoadedAttachment {
    name: String,
    path: String,
    mime_type: String,
    kind: String,
    data: String,
    size: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiFileChange {
    path: String,
    content: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiProjectAction {
    #[serde(rename = "type")]
    action_type: String,
    path: String,
    content: Option<String>,
    new_path: Option<String>,
}

fn clean_root(root: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(root);
    let canonical = path
        .canonicalize()
        .map_err(|_| "La carpeta del proyecto ya no existe o no es accesible.".to_string())?;
    if !canonical.is_dir() {
        return Err("La ruta seleccionada no es una carpeta.".to_string());
    }
    Ok(canonical)
}

fn reject_unsafe_components(path: &Path) -> Result<(), String> {
    if path.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        return Err("La ruta solicitada intenta salir del proyecto.".to_string());
    }
    Ok(())
}

fn existing_project_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let relative_path = Path::new(relative);
    reject_unsafe_components(relative_path)?;
    let joined = root.join(relative_path);
    let mut current = root.to_path_buf();
    for component in relative_path.components() {
        if let Component::Normal(part) = component {
            current.push(part);
            if fs::symlink_metadata(&current)
                .map(|metadata| metadata.file_type().is_symlink())
                .unwrap_or(false)
            {
                return Err(
                    "No se permiten operaciones a través de enlaces simbólicos.".to_string()
                );
            }
        }
    }
    let canonical = joined
        .canonicalize()
        .map_err(|_| format!("No se encontró ‘{}’ dentro del proyecto.", relative))?;
    if !canonical.starts_with(root) {
        return Err(
            "La ruta solicitada está fuera del proyecto o atraviesa un enlace simbólico."
                .to_string(),
        );
    }
    Ok(canonical)
}

fn new_project_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let relative_path = Path::new(relative);
    reject_unsafe_components(relative_path)?;
    let name = relative_path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "El nombre no es válido.".to_string())?;
    validate_name(name)?;
    let parent_relative = relative_path.parent().unwrap_or_else(|| Path::new(""));
    let parent = existing_project_path(root, &parent_relative.to_string_lossy())?;
    if !parent.is_dir() {
        return Err("La ubicación elegida no es una carpeta.".to_string());
    }
    Ok(parent.join(name))
}

fn validate_name(name: &str) -> Result<(), String> {
    let trimmed = name.trim();
    let invalid = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];
    if trimmed.is_empty()
        || trimmed == "."
        || trimmed == ".."
        || trimmed.ends_with('.')
        || trimmed.ends_with(' ')
        || trimmed
            .chars()
            .any(|character| invalid.contains(&character) || character.is_control())
    {
        return Err("El nombre contiene caracteres no permitidos en Windows.".to_string());
    }
    let stem = trimmed.split('.').next().unwrap_or("").to_ascii_uppercase();
    let reserved = [
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
        "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];
    if reserved.contains(&stem.as_str()) {
        return Err("Ese nombre está reservado por Windows.".to_string());
    }
    Ok(())
}

fn gitignore_for(root: &Path) -> Gitignore {
    let mut builder = GitignoreBuilder::new(root);
    let ignore_file = root.join(".gitignore");
    if ignore_file.is_file() {
        let _ = builder.add(ignore_file);
    }
    builder.build().unwrap_or_else(|_| Gitignore::empty())
}

fn is_ignored(root: &Path, path: &Path, is_dir: bool, matcher: &Gitignore) -> bool {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    if ALWAYS_IGNORED.contains(&name)
        || name.ends_with('~')
        || name.ends_with(".tmp")
        || name.ends_with(".temp")
        || name == ".DS_Store"
    {
        return true;
    }
    matcher
        .matched_path_or_any_parents(path.strip_prefix(root).unwrap_or(path), is_dir)
        .is_ignore()
}

fn scan_directory(
    root: &Path,
    directory: &Path,
    matcher: &Gitignore,
    depth: usize,
    count: &mut usize,
) -> Result<Vec<FileNode>, String> {
    if depth > MAX_TREE_DEPTH {
        return Ok(Vec::new());
    }
    let entries = fs::read_dir(directory)
        .map_err(|error| format!("No se pudo leer ‘{}’: {}", directory.display(), error))?;
    let mut nodes = Vec::new();
    for entry in entries {
        if *count >= MAX_TREE_ENTRIES {
            break;
        }
        let entry = entry.map_err(|error| format!("No se pudo leer una entrada: {}", error))?;
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path)
            .map_err(|error| format!("No se pudo inspeccionar ‘{}’: {}", path.display(), error))?;
        if metadata.file_type().is_symlink() {
            continue;
        }
        let is_directory = metadata.is_dir();
        if is_ignored(root, &path, is_directory, matcher) {
            continue;
        }
        *count += 1;
        let relative = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");
        let children = if is_directory {
            scan_directory(root, &path, matcher, depth + 1, count)?
        } else {
            Vec::new()
        };
        nodes.push(FileNode {
            name: entry.file_name().to_string_lossy().to_string(),
            path: path.to_string_lossy().to_string(),
            relative_path: relative,
            is_directory,
            children,
        });
    }
    nodes.sort_by(|a, b| {
        b.is_directory
            .cmp(&a.is_directory)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(nodes)
}

#[tauri::command]
fn open_project(path: String) -> Result<ProjectInfo, String> {
    let root = clean_root(&path)?;
    let name = root
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("Proyecto")
        .to_string();
    Ok(ProjectInfo {
        name,
        path: root.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn scan_project(root: String) -> Result<Vec<FileNode>, String> {
    let root = clean_root(&root)?;
    let matcher = gitignore_for(&root);
    scan_directory(&root, &root, &matcher, 0, &mut 0)
}

#[tauri::command]
fn read_project_file(root: String, relative_path: String) -> Result<FileContent, String> {
    read_project_file_inner(root, relative_path)
}

pub(crate) fn read_project_file_inner(
    root: String,
    relative_path: String,
) -> Result<FileContent, String> {
    let root = clean_root(&root)?;
    let path = existing_project_path(&root, &relative_path)?;
    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    if !metadata.is_file() {
        return Err("La ruta seleccionada no es un archivo.".to_string());
    }
    if metadata.len() > MAX_FILE_BYTES {
        return Err(format!(
            "El archivo ocupa más de {} MB y no se abrirá para evitar bloquear la aplicación.",
            MAX_FILE_BYTES / 1024 / 1024
        ));
    }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    File::open(&path)
        .and_then(|mut file| file.read_to_end(&mut bytes))
        .map_err(|error| format!("No se pudo leer el archivo: {}", error))?;
    if bytes.iter().take(8192).any(|byte| *byte == 0) {
        return Err("Este archivo parece ser binario y no puede editarse como texto.".to_string());
    }
    let content = String::from_utf8(bytes)
        .map_err(|_| "El archivo no utiliza una codificación UTF-8 compatible.".to_string())?;
    Ok(FileContent {
        path: path.to_string_lossy().to_string(),
        relative_path,
        content,
        size: metadata.len(),
    })
}

pub(crate) fn ensure_context_file_allowed(root: &str, relative_path: &str) -> Result<(), String> {
    let root = clean_root(root)?;
    let path = existing_project_path(&root, relative_path)?;
    let metadata = fs::metadata(&path)
        .map_err(|error| format!("No se pudo inspeccionar el archivo: {error}"))?;
    if is_ignored(&root, &path, metadata.is_dir(), &gitignore_for(&root)) {
        return Err(
            "El archivo está excluido por .gitignore o por las reglas seguras de NovaAI Code."
                .into(),
        );
    }
    Ok(())
}

#[tauri::command]
fn write_project_file(root: String, relative_path: String, content: String) -> Result<(), String> {
    let root = clean_root(&root)?;
    let path = existing_project_path(&root, &relative_path)?;
    if !path.is_file() {
        return Err("Solo se pueden guardar archivos de texto existentes.".to_string());
    }
    let parent = path
        .parent()
        .ok_or_else(|| "No se pudo determinar la carpeta del archivo.".to_string())?;
    let mut temporary = NamedTempFile::new_in(parent)
        .map_err(|error| format!("No se pudo preparar el guardado seguro: {}", error))?;
    temporary
        .write_all(content.as_bytes())
        .and_then(|_| temporary.as_file().sync_all())
        .map_err(|error| format!("No se pudieron escribir los cambios: {}", error))?;
    temporary
        .persist(&path)
        .map_err(|error| format!("No se pudo reemplazar el archivo original: {}", error.error))?;
    Ok(())
}

#[tauri::command]
fn create_project_item(root: String, relative_path: String, directory: bool) -> Result<(), String> {
    let root = clean_root(&root)?;
    let path = new_project_path(&root, &relative_path)?;
    if path.exists() {
        return Err("Ya existe un archivo o carpeta con ese nombre.".to_string());
    }
    if directory {
        fs::create_dir(&path).map_err(|error| format!("No se pudo crear la carpeta: {}", error))?;
    } else {
        File::create(&path).map_err(|error| format!("No se pudo crear el archivo: {}", error))?;
    }
    Ok(())
}

#[tauri::command]
fn rename_project_item(
    root: String,
    relative_path: String,
    new_name: String,
) -> Result<(), String> {
    validate_name(&new_name)?;
    let root = clean_root(&root)?;
    let current = existing_project_path(&root, &relative_path)?;
    let parent = current
        .parent()
        .ok_or_else(|| "No se pudo determinar la carpeta actual.".to_string())?;
    let destination = parent.join(new_name.trim());
    if destination.exists() {
        return Err("Ya existe un elemento con ese nombre.".to_string());
    }
    fs::rename(&current, &destination)
        .map_err(|error| format!("No se pudo renombrar: {}", error))?;
    Ok(())
}

#[tauri::command]
fn delete_project_item(root: String, relative_path: String) -> Result<(), String> {
    let root = clean_root(&root)?;
    let path = existing_project_path(&root, &relative_path)?;
    if path == root {
        return Err("No se puede eliminar la carpeta raíz del proyecto.".to_string());
    }
    if path.is_dir() {
        fs::remove_dir_all(&path)
            .map_err(|error| format!("No se pudo eliminar la carpeta: {}", error))?;
    } else {
        fs::remove_file(&path)
            .map_err(|error| format!("No se pudo eliminar el archivo: {}", error))?;
    }
    Ok(())
}

fn attachment_mime(path: &Path) -> (&'static str, &'static str) {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => ("image/png", "image"),
        "jpg" | "jpeg" => ("image/jpeg", "image"),
        "webp" => ("image/webp", "image"),
        "gif" => ("image/gif", "image"),
        "md" => ("text/markdown", "text"),
        "json" => ("application/json", "text"),
        "html" => ("text/html", "text"),
        "css" => ("text/css", "text"),
        "js" | "jsx" | "mjs" => ("text/javascript", "text"),
        "ts" | "tsx" => ("text/typescript", "text"),
        "py" | "rs" | "java" | "go" | "c" | "cpp" | "h" | "hpp" | "toml" | "yaml" | "yml"
        | "xml" | "txt" | "log" | "csv" => ("text/plain", "text"),
        _ => ("application/octet-stream", "unsupported"),
    }
}

#[tauri::command]
fn load_chat_attachment(path: String) -> Result<LoadedAttachment, String> {
    let path = PathBuf::from(path);
    let metadata = fs::symlink_metadata(&path)
        .map_err(|_| "No se encontró el archivo adjunto.".to_string())?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("Solo se pueden adjuntar archivos normales.".into());
    }
    let (mime_type, kind) = attachment_mime(&path);
    if kind == "unsupported" {
        return Err("Este tipo de archivo todavía no puede enviarse a la IA.".into());
    }
    let limit = if kind == "image" {
        10 * 1024 * 1024
    } else {
        2 * 1024 * 1024
    };
    if metadata.len() > limit {
        return Err(format!(
            "El archivo supera el límite de {} MB.",
            limit / 1024 / 1024
        ));
    }
    let bytes = fs::read(&path).map_err(|error| format!("No se pudo leer el adjunto: {error}"))?;
    let data = if kind == "image" {
        BASE64.encode(bytes)
    } else {
        String::from_utf8(bytes).map_err(|_| "El archivo de texto no utiliza UTF-8.".to_string())?
    };
    Ok(LoadedAttachment {
        name: path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("archivo")
            .to_string(),
        path: path.to_string_lossy().to_string(),
        mime_type: mime_type.to_string(),
        kind: kind.to_string(),
        data,
        size: metadata.len(),
    })
}

fn context_files(
    root: &Path,
    directory: &Path,
    matcher: &Gitignore,
    output: &mut Vec<(String, PathBuf)>,
    limit: usize,
) -> Result<(), String> {
    if output.len() >= limit {
        return Ok(());
    }
    let mut entries = fs::read_dir(directory)
        .map_err(|error| format!("No se pudo leer el proyecto: {error}"))?
        .flatten()
        .collect::<Vec<_>>();
    entries.sort_by_key(|entry| entry.file_name().to_string_lossy().to_ascii_lowercase());
    for entry in entries {
        if output.len() >= limit {
            break;
        }
        let path = entry.path();
        let metadata = match fs::symlink_metadata(&path) {
            Ok(value) => value,
            Err(_) => continue,
        };
        if metadata.file_type().is_symlink() || is_ignored(root, &path, metadata.is_dir(), matcher)
        {
            continue;
        }
        if metadata.is_dir() {
            context_files(root, &path, matcher, output, limit)?;
        } else if metadata.is_file() && metadata.len() <= 256 * 1024 {
            let relative = path
                .strip_prefix(root)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");
            output.push((relative, path));
        }
    }
    Ok(())
}

fn collect_context_files(root: &str, limit: usize) -> Result<Vec<(String, PathBuf)>, String> {
    let root = clean_root(root)?;
    let mut files = Vec::new();
    context_files(&root, &root, &gitignore_for(&root), &mut files, limit)?;
    Ok(files)
}

pub(crate) fn project_context_tree(root: &str, limit: usize) -> Result<String, String> {
    let mut output = String::new();
    for (relative, _) in collect_context_files(root, 2_000)? {
        let line = format!("{relative}\n");
        if output.len() + line.len() > limit {
            output.push_str("[Estructura truncada]\n");
            break;
        }
        output.push_str(&line);
    }
    Ok(output)
}

fn prompt_terms(prompt: &str) -> Vec<String> {
    const IGNORED: &[&str] = &[
        "para", "como", "este", "esta", "crear", "crea", "haz", "hacer", "quiero", "puedes",
        "puede", "archivo", "carpeta", "proyecto", "sobre", "with", "that", "this", "from", "make",
        "create", "please", "code",
    ];
    let mut terms = prompt
        .to_ascii_lowercase()
        .split(|character: char| {
            !character.is_ascii_alphanumeric() && character != '_' && character != '-'
        })
        .filter(|term| term.len() >= 3 && !IGNORED.contains(term))
        .map(str::to_string)
        .collect::<Vec<_>>();
    terms.sort();
    terms.dedup();
    terms
}

pub(crate) fn project_context_relevant_snapshot(
    root: &str,
    prompt: &str,
    limit: usize,
    max_files: usize,
) -> Result<String, String> {
    let terms = prompt_terms(prompt);
    let mut ranked = collect_context_files(root, 2_000)?
        .into_iter()
        .map(|(relative, path)| {
            let name = relative.to_ascii_lowercase();
            let matches = terms
                .iter()
                .filter(|term| name.contains(term.as_str()))
                .count();
            let fallback = usize::from(
                name.starts_with("src/")
                    || name.starts_with("app/")
                    || name.contains("/index.")
                    || name.contains("/main.")
                    || name == "readme.md"
                    || name.ends_with("package.json")
                    || name.ends_with("cargo.toml"),
            );
            (matches * 100 + fallback * 10, relative, path)
        })
        .collect::<Vec<_>>();
    ranked.sort_by(|left, right| right.0.cmp(&left.0).then_with(|| left.1.cmp(&right.1)));
    let mut output = String::new();
    for (_, relative, path) in ranked.into_iter().take(max_files) {
        let bytes = match fs::read(path) {
            Ok(bytes) => bytes,
            Err(_) => continue,
        };
        if bytes.iter().take(8192).any(|byte| *byte == 0) {
            continue;
        }
        let Ok(content) = String::from_utf8(bytes) else {
            continue;
        };
        let block = format!("\n--- {relative} ---\n{content}\n");
        let remaining = limit.saturating_sub(output.len());
        if remaining == 0 {
            break;
        }
        if block.len() <= remaining {
            output.push_str(&block);
        } else {
            output.extend(block.chars().take(remaining));
            output.push_str("\n[Archivo truncado]\n");
            break;
        }
    }
    if output.is_empty() {
        output.push_str("[No hay archivos de texto relevantes disponibles]\n");
    }
    Ok(output)
}

#[tauri::command]
fn apply_ai_changes(root: String, changes: Vec<AiFileChange>) -> Result<Vec<String>, String> {
    if changes.is_empty() || changes.len() > 20 {
        return Err("La propuesta debe contener entre 1 y 20 archivos.".into());
    }
    if changes
        .iter()
        .map(|change| change.content.len())
        .sum::<usize>()
        > 2 * 1024 * 1024
    {
        return Err("La propuesta supera el límite seguro de 2 MB.".into());
    }
    let root = clean_root(&root)?;
    let mut prepared = Vec::new();
    for change in changes {
        if change.path.trim().is_empty() {
            return Err("La propuesta contiene una ruta vacía.".into());
        }
        let candidate = root.join(Path::new(&change.path));
        let destination = if candidate.exists() {
            let path = existing_project_path(&root, &change.path)?;
            if !path.is_file() {
                return Err(format!("‘{}’ no es un archivo.", change.path));
            }
            path
        } else {
            new_project_path(&root, &change.path)?
        };
        prepared.push((change.path, destination, change.content));
    }
    let mut applied = Vec::new();
    for (relative, destination, content) in prepared {
        let parent = destination
            .parent()
            .ok_or_else(|| "No se pudo determinar la carpeta de destino.".to_string())?;
        let mut temporary = NamedTempFile::new_in(parent)
            .map_err(|error| format!("No se pudo preparar el cambio: {error}"))?;
        temporary
            .write_all(content.as_bytes())
            .and_then(|_| temporary.as_file().sync_all())
            .map_err(|error| format!("No se pudo escribir ‘{relative}’: {error}"))?;
        temporary
            .persist(&destination)
            .map_err(|error| format!("No se pudo aplicar ‘{relative}’: {}", error.error))?;
        applied.push(relative);
    }
    Ok(applied)
}

fn ensure_ai_action_allowed(root: &Path, relative: &str, is_directory: bool) -> Result<(), String> {
    let relative_path = Path::new(relative);
    reject_unsafe_components(relative_path)?;
    for component in relative_path.components() {
        if let Component::Normal(value) = component {
            let name = value.to_string_lossy();
            if ALWAYS_IGNORED
                .iter()
                .any(|ignored| ignored.eq_ignore_ascii_case(&name))
            {
                return Err(format!(
                    "Nova no puede modificar ‘{relative}’ porque está protegido o ignorado."
                ));
            }
        }
    }
    let candidate = root.join(relative_path);
    if is_ignored(root, &candidate, is_directory, &gitignore_for(root)) {
        return Err(format!(
            "Nova no puede modificar ‘{relative}’ porque está excluido por .gitignore."
        ));
    }
    Ok(())
}

#[tauri::command]
fn apply_ai_actions(root: String, actions: Vec<AiProjectAction>) -> Result<Vec<String>, String> {
    if actions.is_empty() || actions.len() > 30 {
        return Err("La propuesta debe contener entre 1 y 30 operaciones.".into());
    }
    let payload_size = actions
        .iter()
        .filter_map(|action| action.content.as_ref())
        .map(String::len)
        .sum::<usize>();
    if payload_size > 2 * 1024 * 1024 {
        return Err("Las operaciones superan el límite seguro de 2 MB.".into());
    }
    let root = clean_root(&root)?;
    let mut applied = Vec::new();
    for action in actions {
        let kind = action.action_type.as_str();
        ensure_ai_action_allowed(&root, &action.path, kind == "mkdir")?;
        match kind {
            "write" => {
                let content = action
                    .content
                    .ok_or_else(|| format!("Falta el contenido para ‘{}’.", action.path))?;
                let candidate = root.join(Path::new(&action.path));
                let destination = if candidate.exists() {
                    existing_project_path(&root, &action.path)?
                } else {
                    new_project_path(&root, &action.path)?
                };
                if destination.exists() && !destination.is_file() {
                    return Err(format!("‘{}’ no es un archivo.", action.path));
                }
                let parent = destination
                    .parent()
                    .ok_or_else(|| "No se pudo determinar la carpeta de destino.".to_string())?;
                let mut temporary = NamedTempFile::new_in(parent)
                    .map_err(|error| format!("No se pudo preparar ‘{}’: {error}", action.path))?;
                temporary
                    .write_all(content.as_bytes())
                    .and_then(|_| temporary.as_file().sync_all())
                    .map_err(|error| format!("No se pudo escribir ‘{}’: {error}", action.path))?;
                temporary.persist(&destination).map_err(|error| {
                    format!("No se pudo aplicar ‘{}’: {}", action.path, error.error)
                })?;
                applied.push(action.path);
            }
            "mkdir" => {
                let destination = new_project_path(&root, &action.path)?;
                if destination.exists() {
                    return Err(format!("‘{}’ ya existe.", action.path));
                }
                fs::create_dir(&destination).map_err(|error| {
                    format!("No se pudo crear la carpeta ‘{}’: {error}", action.path)
                })?;
                applied.push(action.path);
            }
            "rename" => {
                let new_path = action
                    .new_path
                    .ok_or_else(|| format!("Falta el destino para renombrar ‘{}’.", action.path))?;
                ensure_ai_action_allowed(&root, &new_path, false)?;
                let source = existing_project_path(&root, &action.path)?;
                let destination = new_project_path(&root, &new_path)?;
                if destination.exists() {
                    return Err(format!("‘{new_path}’ ya existe."));
                }
                fs::rename(&source, &destination)
                    .map_err(|error| format!("No se pudo mover ‘{}’: {error}", action.path))?;
                applied.push(new_path);
            }
            "delete" => {
                let target = existing_project_path(&root, &action.path)?;
                if target == root {
                    return Err("Nova no puede eliminar la carpeta raíz del proyecto.".into());
                }
                if target.is_dir() {
                    fs::remove_dir_all(&target).map_err(|error| {
                        format!("No se pudo eliminar ‘{}’: {error}", action.path)
                    })?;
                } else {
                    fs::remove_file(&target).map_err(|error| {
                        format!("No se pudo eliminar ‘{}’: {error}", action.path)
                    })?;
                }
                applied.push(action.path);
            }
            _ => return Err(format!("Operación desconocida: ‘{}’.", action.action_type)),
        }
    }
    Ok(applied)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ai::AiState::default())
        .manage(agent::AgentRuntime::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            open_project,
            scan_project,
            read_project_file,
            write_project_file,
            create_project_item,
            rename_project_item,
            delete_project_item,
            load_chat_attachment,
            apply_ai_changes,
            apply_ai_actions,
            ai::get_ai_settings,
            ai::save_ai_settings,
            ai::set_provider_key,
            ai::delete_provider_key,
            ai::list_ai_models,
            ai::list_local_model_catalog,
            ai::download_local_model,
            ai::test_ai_provider,
            ai::chat_ai,
            ai::cancel_ai_chat
            ,agent::list_agent_tools
            ,agent::detect_project_commands
            ,agent::run_agent_command
            ,agent::cancel_agent_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn project_file_lifecycle_stays_inside_root() {
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path().to_string_lossy().to_string();

        create_project_item(root.clone(), "src".into(), true).unwrap();
        create_project_item(root.clone(), "src/main.rs".into(), false).unwrap();
        write_project_file(root.clone(), "src/main.rs".into(), "fn main() {}\n".into()).unwrap();

        let file = read_project_file(root.clone(), "src/main.rs".into()).unwrap();
        assert_eq!(file.content, "fn main() {}\n");

        rename_project_item(root.clone(), "src/main.rs".into(), "lib.rs".into()).unwrap();
        assert!(read_project_file(root.clone(), "src/lib.rs".into()).is_ok());
        assert!(read_project_file(root.clone(), "../outside.txt".into()).is_err());

        delete_project_item(root.clone(), "src/lib.rs".into()).unwrap();
        assert!(read_project_file(root, "src/lib.rs".into()).is_err());
    }

    #[test]
    fn scan_honors_default_and_gitignore_rules() {
        let temporary = tempfile::tempdir().unwrap();
        fs::create_dir(temporary.path().join("node_modules")).unwrap();
        fs::write(temporary.path().join("node_modules/hidden.js"), "hidden").unwrap();
        fs::write(temporary.path().join(".gitignore"), "secret.txt\n").unwrap();
        fs::write(temporary.path().join("secret.txt"), "secret").unwrap();
        fs::write(temporary.path().join("visible.txt"), "visible").unwrap();

        let nodes = scan_project(temporary.path().to_string_lossy().to_string()).unwrap();
        assert!(nodes.iter().any(|node| node.name == "visible.txt"));
        assert!(!nodes.iter().any(|node| node.name == "secret.txt"));
        assert!(!nodes.iter().any(|node| node.name == "node_modules"));
    }

    #[test]
    fn compact_context_keeps_structure_and_prioritizes_matching_files() {
        let temporary = tempfile::tempdir().unwrap();
        fs::create_dir(temporary.path().join("node_modules")).unwrap();
        fs::write(temporary.path().join("node_modules/hidden.js"), "hidden").unwrap();
        fs::write(temporary.path().join("index.html"), "<main>Login</main>").unwrap();
        fs::write(
            temporary.path().join("styles.css"),
            ".login { color: blue; }",
        )
        .unwrap();
        let root = temporary.path().to_string_lossy().to_string();
        let tree = project_context_tree(&root, 2_000).unwrap();
        let context =
            project_context_relevant_snapshot(&root, "mejora el CSS del login", 2_000, 2).unwrap();
        assert!(tree.contains("index.html"));
        assert!(!tree.contains("node_modules"));
        assert!(context.contains("styles.css"));
    }

    #[test]
    fn rejects_windows_reserved_and_unsafe_names() {
        assert!(validate_name("CON").is_err());
        assert!(validate_name("bad?.txt").is_err());
        assert!(reject_unsafe_components(Path::new("../escape.txt")).is_err());
        assert!(validate_name("safe-file.ts").is_ok());
    }

    #[test]
    fn ai_changes_require_safe_project_relative_paths() {
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path().to_string_lossy().to_string();
        fs::write(temporary.path().join("safe.txt"), "before").unwrap();
        let applied = apply_ai_changes(
            root.clone(),
            vec![AiFileChange {
                path: "safe.txt".into(),
                content: "after".into(),
            }],
        )
        .unwrap();
        assert_eq!(applied, vec!["safe.txt"]);
        assert_eq!(
            fs::read_to_string(temporary.path().join("safe.txt")).unwrap(),
            "after"
        );
        assert!(apply_ai_changes(
            root,
            vec![AiFileChange {
                path: "../escape.txt".into(),
                content: "blocked".into()
            }]
        )
        .is_err());
    }

    #[test]
    fn ai_actions_create_folders_files_rename_and_delete_inside_project() {
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path().to_string_lossy().to_string();
        let applied = apply_ai_actions(
            root.clone(),
            vec![
                AiProjectAction {
                    action_type: "mkdir".into(),
                    path: "src".into(),
                    content: None,
                    new_path: None,
                },
                AiProjectAction {
                    action_type: "write".into(),
                    path: "src/index.html".into(),
                    content: Some("<h1>Nova</h1>".into()),
                    new_path: None,
                },
                AiProjectAction {
                    action_type: "rename".into(),
                    path: "src/index.html".into(),
                    content: None,
                    new_path: Some("src/home.html".into()),
                },
            ],
        )
        .unwrap();
        assert_eq!(applied.len(), 3);
        assert_eq!(
            fs::read_to_string(temporary.path().join("src/home.html")).unwrap(),
            "<h1>Nova</h1>"
        );
        apply_ai_actions(
            root.clone(),
            vec![AiProjectAction {
                action_type: "delete".into(),
                path: "src/home.html".into(),
                content: None,
                new_path: None,
            }],
        )
        .unwrap();
        assert!(!temporary.path().join("src/home.html").exists());
        assert!(apply_ai_actions(
            root.clone(),
            vec![AiProjectAction {
                action_type: "write".into(),
                path: "../escape.txt".into(),
                content: Some("blocked".into()),
                new_path: None
            }]
        )
        .is_err());
        assert!(apply_ai_actions(
            root,
            vec![AiProjectAction {
                action_type: "mkdir".into(),
                path: ".git/hooks".into(),
                content: None,
                new_path: None
            }]
        )
        .is_err());
    }
}
