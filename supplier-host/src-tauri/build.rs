use std::env;

fn main() {
    let skin_id = env::var("SKIN_ID").unwrap_or("default".to_owned());
    println!("cargo:rustc-env=SKIN_ID={}", skin_id);
    println!("cargo:rerun-if-env-changed=SKIN_ID");
    shadow_rs::ShadowBuilder::builder().build().unwrap();
    tauri_build::build()
}
