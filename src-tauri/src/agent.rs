use serde::{Deserialize, Serialize};
use std::{collections::HashMap, path::{Path, PathBuf}, process::Stdio, time::{Duration, Instant}};
use tauri::{ipc::Channel, State};
use tokio::{io::{AsyncBufReadExt, BufReader}, process::Command, sync::{mpsc, Mutex}};
use tokio_util::sync::CancellationToken;

const MAX_OUTPUT_BYTES: usize = 512 * 1024;
const MAX_COMMAND_SECS: u64 = 900;

pub struct AgentRuntime { active: Mutex<HashMap<String, CancellationToken>> }
impl Default for AgentRuntime { fn default() -> Self { Self { active: Mutex::new(HashMap::new()) } } }

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentToolSpec { id: &'static str, description: &'static str, risk: &'static str, permission: &'static str, timeout_secs: u64, cancellable: bool }

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedCommand { id: String, label: String, program: String, args: Vec<String>, kind: String }

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCommandRequest { request_id: String, root: String, cwd: String, program: String, args: Vec<String>, timeout_secs: u64 }

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", rename_all_fields = "camelCase", tag = "type")]
pub enum AgentCommandEvent {
    Started { command: String },
    Output { stream: String, text: String },
    Finished { exit_code: Option<i32>, duration_ms: u64, truncated: bool },
    Cancelled,
    Error { code: String, title: String, explanation: String, action: String },
}

#[tauri::command]
pub fn list_agent_tools() -> Vec<AgentToolSpec> {
    vec![
        AgentToolSpec { id:"list_directory", description:"Lista contenido dentro del proyecto", risk:"low", permission:"read", timeout_secs:10, cancellable:false },
        AgentToolSpec { id:"read_file", description:"Lee un archivo de texto seguro", risk:"low", permission:"read", timeout_secs:10, cancellable:false },
        AgentToolSpec { id:"search_text", description:"Busca texto en archivos del proyecto", risk:"low", permission:"read", timeout_secs:30, cancellable:true },
        AgentToolSpec { id:"write_file", description:"Crea o modifica un archivo mostrando diff", risk:"medium", permission:"write", timeout_secs:10, cancellable:false },
        AgentToolSpec { id:"delete_path", description:"Elimina un elemento tras aprobación explícita", risk:"high", permission:"destructive", timeout_secs:10, cancellable:false },
        AgentToolSpec { id:"run_command", description:"Ejecuta una herramienta permitida dentro del proyecto", risk:"medium", permission:"execute", timeout_secs:MAX_COMMAND_SECS, cancellable:true },
        AgentToolSpec { id:"run_tests", description:"Ejecuta las pruebas detectadas del proyecto", risk:"medium", permission:"execute", timeout_secs:MAX_COMMAND_SECS, cancellable:true },
        AgentToolSpec { id:"run_build", description:"Compila el proyecto con un comando detectado", risk:"medium", permission:"execute", timeout_secs:MAX_COMMAND_SECS, cancellable:true },
    ]
}

fn canonical_root(value: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(value).canonicalize().map_err(|_| "La carpeta del proyecto no existe o no es accesible.".to_string())?;
    if !root.is_dir() { return Err("La ruta asignada no es una carpeta.".into()); }
    Ok(root)
}

fn safe_cwd(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let relative = Path::new(relative);
    if relative.is_absolute() || relative.components().any(|part| matches!(part, std::path::Component::ParentDir | std::path::Component::Prefix(_) | std::path::Component::RootDir)) { return Err("La carpeta de ejecución intenta salir del proyecto.".into()); }
    let cwd = root.join(relative).canonicalize().map_err(|_| "La carpeta de ejecución no existe.".to_string())?;
    if !cwd.starts_with(root) || !cwd.is_dir() { return Err("La carpeta de ejecución está fuera del proyecto.".into()); }
    Ok(cwd)
}

fn allowed_program(value: &str) -> Option<&'static str> {
    let name = value.trim().to_ascii_lowercase();
    match name.trim_end_matches(".exe").trim_end_matches(".cmd") {
        "npm" => Some("npm.cmd"), "npx" => Some("npx.cmd"), "pnpm" => Some("pnpm.cmd"), "yarn" => Some("yarn.cmd"),
        "cargo" => Some("cargo"), "rustc" => Some("rustc"), "python" => Some("python"), "py" => Some("py"),
        "pytest" => Some("pytest"), "dotnet" => Some("dotnet"), "go" => Some("go"), "java" => Some("java"), "mvn" => Some("mvn.cmd"), "gradle" => Some("gradle"),
        _ => None,
    }
}

fn validate_args(args: &[String]) -> Result<(), String> {
    if args.len() > 40 || args.iter().any(|arg| arg.len() > 500 || arg.contains('\0') || ["&&", "||", ";", "`", "$(`", ">", "<"].iter().any(|token| arg.contains(token))) { return Err("El comando contiene operadores de shell o argumentos no seguros.".into()); }
    let joined = args.join(" ").to_ascii_lowercase();
    let blocked = ["--global", " -g ", "install -g", "uninstall -g", "publish", "curl", "wget", "powershell", "cmd /c", "rm -rf", "rmdir /s", "format", "shutdown"];
    if blocked.iter().any(|item| joined.contains(item)) { return Err("El comando intenta instalar globalmente, publicar, descargar scripts o modificar el sistema.".into()); }
    Ok(())
}

#[tauri::command]
pub fn detect_project_commands(root: String) -> Result<Vec<DetectedCommand>, String> {
    let root = canonical_root(&root)?; let mut found = Vec::new();
    let mut add = |id:&str,label:&str,program:&str,args:&[&str],kind:&str| found.push(DetectedCommand{id:id.into(),label:label.into(),program:program.into(),args:args.iter().map(|v|v.to_string()).collect(),kind:kind.into()});
    if root.join("package.json").is_file() {
        let value = std::fs::read_to_string(root.join("package.json")).ok().and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok());
        let scripts = value.as_ref().and_then(|v|v.get("scripts")).and_then(|v|v.as_object());
        if scripts.is_some_and(|s|s.contains_key("test")) { add("npm-test","Ejecutar pruebas","npm",&["test"],"test"); }
        if scripts.is_some_and(|s|s.contains_key("build")) { add("npm-build","Compilar proyecto","npm",&["run","build"],"build"); }
        if scripts.is_some_and(|s|s.contains_key("lint")) { add("npm-lint","Comprobar código","npm",&["run","lint"],"check"); }
    }
    if root.join("Cargo.toml").is_file() { add("cargo-test","Ejecutar pruebas Rust","cargo",&["test"],"test"); add("cargo-check","Comprobar Rust","cargo",&["check"],"check"); add("cargo-build","Compilar Rust","cargo",&["build"],"build"); }
    if root.join("pyproject.toml").is_file() || root.join("pytest.ini").is_file() || root.join("tests").is_dir() { add("pytest","Ejecutar pruebas Python","python",&["-m","pytest"],"test"); }
    if root.join("go.mod").is_file() { add("go-test","Ejecutar pruebas Go","go",&["test","./..."],"test"); add("go-build","Compilar Go","go",&["build","./..."],"build"); }
    if std::fs::read_dir(&root).ok().is_some_and(|mut entries| entries.any(|e|e.ok().is_some_and(|x|x.path().extension().is_some_and(|v|v=="sln")))) { add("dotnet-test","Ejecutar pruebas .NET","dotnet",&["test"],"test"); add("dotnet-build","Compilar .NET","dotnet",&["build"],"build"); }
    Ok(found)
}

#[tauri::command]
pub async fn run_agent_command(request: AgentCommandRequest, on_event: Channel<AgentCommandEvent>, runtime: State<'_, AgentRuntime>) -> Result<(), String> {
    let root = canonical_root(&request.root)?; let cwd = safe_cwd(&root, &request.cwd)?; validate_args(&request.args)?;
    let program = allowed_program(&request.program).ok_or_else(|| "El programa solicitado no está en la lista segura de NovaAI Code.".to_string())?;
    if request.request_id.trim().is_empty() { return Err("Falta el identificador del proceso.".into()); }
    let timeout = request.timeout_secs.clamp(1, MAX_COMMAND_SECS); let token = CancellationToken::new(); runtime.active.lock().await.insert(request.request_id.clone(), token.clone());
    let display = format!("{} {}", request.program, request.args.join(" ")).trim().to_string(); let _ = on_event.send(AgentCommandEvent::Started{command:display}); let started=Instant::now();
    let mut child = Command::new(program).args(&request.args).current_dir(cwd).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true).spawn().map_err(|e|format!("No se pudo iniciar el comando: {e}"))?;
    let (tx, mut rx)=mpsc::unbounded_channel::<(String,String)>();
    if let Some(pipe)=child.stdout.take() { let tx=tx.clone(); tokio::spawn(async move { let mut lines=BufReader::new(pipe).lines(); while let Ok(Some(line))=lines.next_line().await { let _=tx.send(("stdout".into(),format!("{line}\n"))); } }); }
    if let Some(pipe)=child.stderr.take() { let tx=tx.clone(); tokio::spawn(async move { let mut lines=BufReader::new(pipe).lines(); while let Ok(Some(line))=lines.next_line().await { let _=tx.send(("stderr".into(),format!("{line}\n"))); } }); }
    drop(tx);
    let mut output=0usize; let mut truncated=false; let deadline=tokio::time::sleep(Duration::from_secs(timeout)); tokio::pin!(deadline);
    let exit = loop { tokio::select! {
        _=token.cancelled()=>{ let _=child.kill().await; let _=on_event.send(AgentCommandEvent::Cancelled); break None; }
        _=&mut deadline=>{ let _=child.kill().await; let _=on_event.send(AgentCommandEvent::Error{code:"COMMAND_TIMEOUT".into(),title:"El comando tardó demasiado".into(),explanation:format!("Superó el límite de {timeout} segundos."),action:"Reduce la tarea o aumenta el límite permitido.".into()}); break None; }
        item=rx.recv()=>{ if let Some((stream,text))=item { if output < MAX_OUTPUT_BYTES { let remaining=MAX_OUTPUT_BYTES-output; let sent:String=text.chars().take(remaining).collect(); output+=sent.len(); let _=on_event.send(AgentCommandEvent::Output{stream,text:sent}); } else { truncated=true; } } }
        status=child.wait()=>{ break status.ok().and_then(|s|s.code()); }
    }};
    runtime.active.lock().await.remove(&request.request_id);
    if !token.is_cancelled() { let _=on_event.send(AgentCommandEvent::Finished{exit_code:exit,duration_ms:started.elapsed().as_millis() as u64,truncated}); }
    Ok(())
}

#[tauri::command]
pub async fn cancel_agent_command(request_id: String, runtime: State<'_, AgentRuntime>) -> Result<bool,String> { if let Some(token)=runtime.active.lock().await.get(&request_id) { token.cancel(); Ok(true) } else { Ok(false) } }

#[cfg(test)] mod tests { use super::*;
    #[test] fn blocks_shell_and_system_commands(){ assert!(allowed_program("powershell").is_none()); assert!(validate_args(&["test".into(),"&&".into(),"format".into()]).is_err()); assert!(validate_args(&["test".into()]).is_ok()); }
    #[test] fn detects_project_commands_without_guessing(){ let temp=tempfile::tempdir().unwrap(); std::fs::write(temp.path().join("package.json"),r#"{"scripts":{"test":"vitest","build":"vite build"}}"#).unwrap(); let commands=detect_project_commands(temp.path().to_string_lossy().to_string()).unwrap(); assert!(commands.iter().any(|c|c.id=="npm-test")); assert!(commands.iter().any(|c|c.id=="npm-build")); }
}
