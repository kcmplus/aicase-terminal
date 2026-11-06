.PHONY: all run build build-shared-ui clean clippy

ifeq ($(OS),Windows_NT)
define rm_rf
powershell "if(Test-Path '$(1)'){Remove-Item -Recurse -Force '$(1)'}"
endef
else
define rm_rf
rm -rf $(1)
endef
endif

all: run

run:
	npm run tauri:dev:default

# Keep the supplier's make build entry. Signing credentials stay local.
build:
ifeq ($(OS),Windows_NT)
	powershell -ExecutionPolicy Bypass -File ./build.ps1
else
	npm run tauri:build:default
endif

# Shared UI is imported from source and compiled with the main frontend.
# Preserve the original target as an alias; a separate shared dist is not used.
build-shared-ui:
	npm run build

clean:
	$(call rm_rf,node_modules)
	cd src-tauri && cargo clean

clippy:
	cd src-tauri && cargo +nightly clippy --all-targets --all-features
