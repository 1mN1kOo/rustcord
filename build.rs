fn main() {
    println!("cargo:rerun-if-changed=icons/icon.ico");
    println!("cargo:rerun-if-changed=icons/icon.png");
    let attributes = tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "list_sources",
            "start_capture",
            "stop_capture",
        ]),
    );
    tauri_build::try_build(attributes).expect("failed to run tauri-build");
}

