#!/usr/bin/env bash
# Reuse upstream FRR-K8S manifests and remote-API wiring, with VM network plumbing.
set -eo pipefail
CONFIG=$(realpath "$1")
OVNK_PATH=$(realpath "$2")
FRR_ENV=$(realpath "$3")
export KUBECONFIG
KUBECONFIG=$(realpath "$4")
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
STATE_DIR="$(dirname "$FRR_ENV")/../vm-routing"
DIR="${OVNK_PATH}/contrib"
source "$FRR_ENV"
source "${DIR}/kind-dpu-sim-lib.sh"
source "${DIR}/kind-common.sh"
export DPU_MODE=dpu
python3 "${SCRIPT_DIR}/configure-vm-routing.py" "$CONFIG" "$STATE_DIR" "$FRR_DEPLOYED_IMAGE"
install_frr_k8s_crds
install_frr_k8s 179
wait_for_frr_k8s
kubectl --kubeconfig "$FRR_K8S_HOST_KUBECONFIG" apply -f "${STATE_DIR}/receive-all.yaml"
