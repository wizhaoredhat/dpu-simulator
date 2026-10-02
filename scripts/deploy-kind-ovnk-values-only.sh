#!/usr/bin/env bash
# Backwards-compatible Kind entry point for the shared deployment helper.
set -euo pipefail
export DPU_SIM_MODE=kind
export DPU_SIM_CONFIG="${DPU_SIM_CONFIG:-config-kind-ovnk-offload.yaml}"
exec "$(dirname "$0")/deploy-ovnk-values-only.sh" "$@"
