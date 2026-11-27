use std::path::Path;
use std::process::Command;

fn normalize_version(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    let stripped = trimmed
        .strip_prefix('v')
        .or_else(|| trimmed.strip_prefix('V'))
        .unwrap_or(trimmed)
        .trim();
    if stripped.is_empty() {
        None
    } else {
        Some(stripped.to_string())
    }
}

fn run_git(args: &[&str]) -> Option<String> {
    let output = Command::new("git")
        .args(args)
        .current_dir("../..")
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8(output.stdout).ok()?;
    let trimmed = text.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn emit_git_rerun_hints() {
    for rel in [
        "../../.git/HEAD",
        "../../.git/packed-refs",
        "../../.git/refs/tags",
    ] {
        if Path::new(rel).exists() {
            println!("cargo:rerun-if-changed={rel}");
        }
    }
}

fn main() {
    println!("cargo:rerun-if-changed=../../migrations");
    println!("cargo:rerun-if-env-changed=API_LAB_SERVER_VERSION");
    println!("cargo:rerun-if-env-changed=API_LAB_GIT_SHA");
    emit_git_rerun_hints();

    let version = std::env::var("API_LAB_SERVER_VERSION")
        .ok()
        .and_then(|v| normalize_version(&v))
        .or_else(|| {
            run_git(&["describe", "--tags", "--abbrev=0"]).and_then(|tag| normalize_version(&tag))
        })
        .or_else(|| {
            std::env::var("CARGO_PKG_VERSION")
                .ok()
                .and_then(|v| normalize_version(&v))
        })
        .unwrap_or_else(|| "0.1.0".to_string());

    let git_sha = std::env::var("API_LAB_GIT_SHA")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| run_git(&["rev-parse", "--short", "HEAD"]))
        .unwrap_or_else(|| "unknown".to_string());

    println!("cargo:rustc-env=API_LAB_SERVER_VERSION={version}");
    println!("cargo:rustc-env=API_LAB_GIT_SHA={git_sha}");
}
