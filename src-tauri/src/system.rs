use serde::Serialize;
use std::{path::Path, time::Duration};
use sysinfo::{Disks, System};
use tokio::{process::Command, time::timeout};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ModelFit {
    size: &'static str,
    rating: &'static str,
    required_ram_gb: u64,
    required_vram_gb: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HardwareInfo {
    cpu: String,
    physical_cores: usize,
    logical_cores: usize,
    ram_bytes: u64,
    available_ram_bytes: u64,
    disk_available_bytes: Option<u64>,
    gpu: Option<String>,
    vram_bytes: Option<u64>,
    recommendations: Vec<ModelFit>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "PascalCase")]
struct VideoController {
    name: Option<String>,
    adapter_ram: Option<u64>,
}

async fn windows_gpu() -> (Option<String>, Option<u64>) {
    if !cfg!(target_os = "windows") {
        return (None, None);
    }
    let mut command = Command::new("powershell.exe");
    command.kill_on_drop(true).args([
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json -Compress",
    ]);
    let Ok(Ok(output)) = timeout(Duration::from_secs(4), command.output()).await else {
        return (None, None);
    };
    if !output.status.success() {
        return (None, None);
    }
    let Ok(value) = serde_json::from_slice::<serde_json::Value>(&output.stdout) else {
        return (None, None);
    };
    let values = value.as_array().cloned().unwrap_or_else(|| vec![value]);
    let controllers = values
        .into_iter()
        .filter_map(|item| serde_json::from_value::<VideoController>(item).ok())
        .collect::<Vec<_>>();
    let name = controllers
        .iter()
        .filter_map(|item| item.name.as_deref())
        .find(|name| !name.to_ascii_lowercase().contains("basic display"))
        .map(str::to_string);
    let vram = controllers.iter().filter_map(|item| item.adapter_ram).max();
    (name, vram)
}

fn model_fits(ram: u64, vram: Option<u64>) -> Vec<ModelFit> {
    let gib = 1024_u64.pow(3);
    let vram = vram.unwrap_or_default();
    [
        ("7B / 8B", 16 * gib, 6 * gib),
        ("14B", 24 * gib, 10 * gib),
        ("30B / 32B", 48 * gib, 20 * gib),
        ("70B", 96 * gib, 48 * gib),
    ]
    .into_iter()
    .map(|(label, needed_ram, needed_vram)| {
        let rating = if vram >= needed_vram {
            "excellent"
        } else if ram >= needed_ram {
            "acceptable"
        } else {
            "not_recommended"
        };
        ModelFit {
            size: label,
            rating,
            required_ram_gb: needed_ram / gib,
            required_vram_gb: needed_vram / gib,
        }
    })
    .collect()
}

#[tauri::command]
pub(crate) async fn inspect_hardware(root: Option<String>) -> Result<HardwareInfo, String> {
    let mut system = System::new_all();
    system.refresh_all();
    let disks = Disks::new_with_refreshed_list();
    let project_path = root.as_deref().map(Path::new);
    let disk_available_bytes = disks
        .list()
        .iter()
        .filter(|disk| project_path.is_none_or(|path| path.starts_with(disk.mount_point())))
        .max_by_key(|disk| disk.mount_point().as_os_str().len())
        .map(|disk| disk.available_space());
    let (gpu, vram_bytes) = windows_gpu().await;
    let ram_bytes = system.total_memory();
    Ok(HardwareInfo {
        cpu: system
            .cpus()
            .first()
            .map(|cpu| cpu.brand().trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "CPU no identificada".into()),
        physical_cores: System::physical_core_count().unwrap_or_default(),
        logical_cores: system.cpus().len(),
        ram_bytes,
        available_ram_bytes: system.available_memory(),
        disk_available_bytes,
        gpu,
        vram_bytes,
        recommendations: model_fits(ram_bytes, vram_bytes),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recommendations_reject_models_that_do_not_fit() {
        let fits = model_fits(8 * 1024_u64.pow(3), Some(4 * 1024_u64.pow(3)));
        assert_eq!(fits[0].rating, "not_recommended");
        assert_eq!(fits[3].rating, "not_recommended");
    }
}
