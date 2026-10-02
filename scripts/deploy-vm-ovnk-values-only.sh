#!/usr/bin/env bash
# VM entry point. Optional --no-overlay provisions FRR/BGP and the Uplink bridge.
set -euo pipefail
export DPU_SIM_MODE=vm
export DPU_SIM_CONFIG="${DPU_SIM_CONFIG:-config-ovnk-offload.yaml}"
exec "$(dirname "$0")/deploy-ovnk-values-only.sh" "$@"
