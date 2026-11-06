use std::{collections::HashMap, env};

shadow_rs::shadow!(build);


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    {
        // for KMS: DRM_IOCTL_MODE_CREATE_DUMB failed: Permission denied
        use std::env;
        env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    let cmd = clap::Command::new(build::PROJECT_NAME)
        .version(build::CLAP_LONG_VERSION)
        .about("A Phonecase diy")
        .subcommand_negates_reqs(true)
        .arg(
            clap::Arg::new("config")
                .long("config")
                .short('c')
                .help("config file for server"),
        );

    let matches = cmd.get_matches();
    let config = if let Some(config) = matches.get_one::<String>("config") {
        config.to_owned()
    } else {
        "".to_owned()
    };

    let platform = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        &env::var("PLATFORM").unwrap_or_default()
    };

    let runmode = if cfg!(debug_assertions) {
        "dev".to_owned()
    } else {
        env::var("RUNMODE").unwrap_or_default()
    };

    const SKIN_ID: &str = env!("SKIN_ID");

    let config = if !config.is_empty() {
        config
    } else {
        let file = if runmode != "dev" {
            "config.toml"
        } else {
            "config-dev.toml"
        };
        file.to_owned()
    };

    let mut defines: HashMap<String, String> = HashMap::default();
    defines.insert("app_id".to_owned(), build::PROJECT_NAME.to_owned());
    defines.insert("app_ver".to_owned(), build::PKG_VERSION.to_owned());
    defines.insert("build_os".to_owned(), build::BUILD_OS.to_owned());
    defines.insert("build_env".to_owned(), build::RUST_VERSION.to_owned());
    defines.insert("build_time".to_owned(), build::BUILD_TIME.to_owned());
    defines.insert("git_branch".to_owned(), build::BRANCH.to_owned());
    defines.insert("git_commit".to_owned(), build::SHORT_COMMIT.to_owned());
    defines.insert("platform".to_owned(), platform.to_owned());
    defines.insert("runmode".to_owned(), runmode.to_owned());
    defines.insert("skin_id".to_owned(), SKIN_ID.to_owned());

    let app = phonecase_core::create_builder(config, defines);
    println!("App run...");
    app.run(tauri::generate_context!()).expect("App run failed");
}
