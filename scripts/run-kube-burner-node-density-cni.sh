#!/usr/bin/env bash
# Run kube-burner node-density-cni against the dpu-sim host Kind cluster with
# dpusim.io/vf on every workload pod (no SR-IOV / resource-injector).
#
# Preferred entrypoint (parity with dpu-sim tft):
#   ./bin/dpu-sim kube-burner run --config config-kind-ovnk-offload.yaml
#   ./bin/dpu-sim kube-burner cleanup --config config-kind-ovnk-offload.yaml
#
# This script remains for lab use without rebuilding dpu-sim. Based on kube-burner
# node-density-cni, customized for dpu-simulator DPU-host offload on Kind.
# Safe to re-run: previous namespaces are garbage-collected by default.
#
# Usage (on the lab server from /root/dpu-simulator):
#   ./scripts/run-kube-burner-node-density-cni.sh
#   ./scripts/run-kube-burner-node-density-cni.sh --pods-per-node 45
#   ./scripts/run-kube-burner-node-density-cni.sh --selector 'k8s.ovn.org/dpu-host='
#   ./scripts/run-kube-burner-node-density-cni.sh --cleanup
#   ./scripts/run-kube-burner-node-density-cni.sh --skip-install
#
# Options:
#   --pods-per-node N     Pods per selected node (default: 45). Job iterations =
#                         nodes * pods-per-node / 2 (kube-burner-ocp style).
#   --selector EXPR       Node label selector for workers (default:
#                         k8s.ovn.org/dpu-host=).
#   --kubeconfig PATH     Host cluster kubeconfig (default: kubeconfig/dpu-sim-host.kubeconfig)
#   --work-dir PATH       kube-burner working directory
#   --kube-burner-bin PATH  Path to kube-burner binary (default: PATH or ~/.local/bin)
#   --skip-install        Do not run the official kube-burner install script
#   --skip-preflight      Skip VF capacity warning / node checks
#   --force               Run even if pods-per-node exceeds allocatable dpusim.io/vf
#   --qps N               kube-burner API QPS (default: 20, kube-burner-ocp default)
#   --burst N             kube-burner API burst (default: 20, matches --qps if only --qps set)
#   --no-gc               Leave namespaces after the run (default: gc=true)
#   --local-indexing      Write collected-metrics-* under the work dir
#   --cleanup             Delete node-density-cni-* namespaces and exit
#   -h, --help            Show usage

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TEMPLATE_DIR="${PROJECT_ROOT}/pkg/kubeburner/templates"

KUBECONFIG_PATH="${PROJECT_ROOT}/kubeconfig/dpu-sim-host.kubeconfig"
WORK_DIR="${PROJECT_ROOT}/workloads/kube-burner-node-density-cni-dpusim"
KUBE_BURNER_BIN="${KUBE_BURNER_BIN:-}"

# Must match pkg/config.DPUHostNodeLabelKey + "=" (existence selector).
SELECTOR="${SELECTOR:-k8s.ovn.org/dpu-host=}"
PODS_PER_NODE=45
# Must match pkg/deviceplugin.VFResourceName.
VF_RESOURCE="dpusim.io/vf"
SKIP_INSTALL=0
SKIP_PREFLIGHT=0
FORCE=0
CLEANUP_ONLY=0
GC=true
QPS=""
BURST=""
LOCAL_INDEXING=false
ALERTING=false
IGNORE_HEALTH=true

log() {
	printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"
}

die() {
	log "ERROR: $*"
	exit 1
}

usage() {
	sed -n '2,37p' "$0" | sed 's/^# \{0,1\}//'
}

parse_args() {
	while [[ $# -gt 0 ]]; do
		case "$1" in
		--pods-per-node)
			PODS_PER_NODE="$2"
			shift 2
			;;
		--selector)
			SELECTOR="$2"
			shift 2
			;;
		--kubeconfig)
			KUBECONFIG_PATH="$2"
			shift 2
			;;
		--work-dir)
			WORK_DIR="$2"
			shift 2
			;;
		--kube-burner-bin)
			KUBE_BURNER_BIN="$2"
			shift 2
			;;
		--skip-install)
			SKIP_INSTALL=1
			shift
			;;
		--skip-preflight)
			SKIP_PREFLIGHT=1
			shift
			;;
		--force)
			FORCE=1
			shift
			;;
		--qps)
			QPS="$2"
			shift 2
			;;
		--burst)
			BURST="$2"
			shift 2
			;;
		--no-gc)
			GC=false
			shift
			;;
		--local-indexing)
			LOCAL_INDEXING=true
			shift
			;;
		--cleanup)
			CLEANUP_ONLY=1
			shift
			;;
		-h | --help)
			usage
			exit 0
			;;
		*)
			die "unknown argument: $1 (try --help)"
			;;
		esac
	done
}

kubectl_host() {
	kubectl --kubeconfig "${KUBECONFIG_PATH}" "$@"
}

cleanup_namespaces() {
	log "Deleting namespaces matching node-density-cni*"
	kubectl_host get ns -o name 2>/dev/null | grep 'namespace/node-density-cni' | while read -r ns; do
		kubectl_host delete "$ns" --wait=false || true
	done
}

install_kube_burner() {
	if [[ -n "${KUBE_BURNER_BIN}" ]]; then
		[[ -x "${KUBE_BURNER_BIN}" ]] || die "kube-burner not found at ${KUBE_BURNER_BIN}"
		return 0
	fi
	if command -v kube-burner >/dev/null 2>&1; then
		KUBE_BURNER_BIN="$(command -v kube-burner)"
		log "Using kube-burner from PATH: ${KUBE_BURNER_BIN}"
		return 0
	fi
	if [[ -x "${HOME}/.local/bin/kube-burner" ]]; then
		KUBE_BURNER_BIN="${HOME}/.local/bin/kube-burner"
		log "Using kube-burner at ${KUBE_BURNER_BIN}"
		return 0
	fi
	if [[ "${SKIP_INSTALL}" -eq 1 ]]; then
		die "kube-burner not found; install it or pass --kube-burner-bin (drop --skip-install to auto-install)"
	fi

	log "Installing kube-burner via official install script"
	curl -Ls https://raw.githubusercontent.com/kube-burner/kube-burner/refs/heads/main/hack/install.sh | bash
	if command -v kube-burner >/dev/null 2>&1; then
		KUBE_BURNER_BIN="$(command -v kube-burner)"
	elif [[ -x "${HOME}/.local/bin/kube-burner" ]]; then
		KUBE_BURNER_BIN="${HOME}/.local/bin/kube-burner"
	else
		die "kube-burner install finished but binary not found in PATH or ~/.local/bin"
	fi
	log "kube-burner installed at ${KUBE_BURNER_BIN}"
}

prepare_workdir() {
	mkdir -p "${WORK_DIR}"
	cp -f "${TEMPLATE_DIR}/"*.yml "${WORK_DIR}/"

	local affinity_block
	affinity_block="$(selector_to_node_affinity_yaml "${SELECTOR}")"
	for deployment in curl-deployment.yml webserver-deployment.yml; do
		python3 - "${WORK_DIR}/${deployment}" "${affinity_block}" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
affinity = sys.argv[2]
text = path.read_text()
if "__NODE_AFFINITY__" not in text:
    raise SystemExit(f"placeholder missing in {path}")
path.write_text(text.replace("__NODE_AFFINITY__", affinity))
PY
	done

	log "Workload templates synced to ${WORK_DIR}"
}

selector_to_node_affinity_yaml() {
	local selector="$1"
	python3 - "${selector}" <<'PY'
import sys

selector = sys.argv[1]
expressions = []
for raw in selector.split(","):
    part = raw.strip()
    if not part:
        continue
    if "!=" in part:
        key, val = part.split("!=", 1)
        if val == "":
            expressions.append({"key": key, "operator": "DoesNotExist"})
        else:
            expressions.append({"key": key, "operator": "NotIn", "values": [val]})
    elif "=" in part:
        key, val = part.split("=", 1)
        if val == "":
            expressions.append({"key": key, "operator": "Exists"})
        else:
            expressions.append({"key": key, "operator": "In", "values": [val]})
    else:
        raise SystemExit(f"unsupported selector fragment: {part}")

print("            nodeSelectorTerms:")
print("            - matchExpressions:")
for expr in expressions:
    print(f"              - key: {expr['key']}")
    print(f"                operator: {expr['operator']}")
    if "values" in expr:
        print("                values:")
        for value in expr["values"]:
            print(f"                  - {value}")
PY
}

count_selected_nodes() {
	kubectl_host get nodes -l "${SELECTOR}" --no-headers 2>/dev/null | wc -l | tr -d ' '
}

min_allocatable_vf() {
	kubectl_host get nodes -l "${SELECTOR}" \
		-o jsonpath='{range .items[*]}{.status.allocatable.dpusim\.io/vf}{"\n"}{end}' \
		2>/dev/null | sort -n | head -1
}

compute_iterations() {
	local node_count="$1"
	echo $((node_count * PODS_PER_NODE / 2))
}

preflight() {
	[[ "${SKIP_PREFLIGHT}" -eq 1 ]] && return 0

	local node_count min_vf max_supported
	node_count="$(count_selected_nodes)"
	[[ "${node_count}" -gt 0 ]] || die "no nodes match selector '${SELECTOR}'"

	min_vf="$(min_allocatable_vf)"
	if [[ -z "${min_vf}" || "${min_vf}" == "<no value>" ]]; then
		die "selected nodes do not advertise ${VF_RESOURCE}; is the device plugin running?"
	fi

	max_supported="${min_vf}"
	if [[ "${PODS_PER_NODE}" -gt "${max_supported}" && "${FORCE}" -eq 0 ]]; then
		log "WARNING: --pods-per-node ${PODS_PER_NODE} exceeds min allocatable ${VF_RESOURCE} (${min_vf}) per node."
		log "         Only ~${max_supported} VF-consuming pods can schedule per node."
		log "         Re-run with --pods-per-node ${max_supported} or pass --force to continue anyway."
		PODS_PER_NODE="${max_supported}"
		log "         Continuing with --pods-per-node ${PODS_PER_NODE}"
	fi

	log "Preflight: nodes=${node_count} selector='${SELECTOR}' min_${VF_RESOURCE}=${min_vf}"
}

resolve_qps_burst() {
	# Defaults match kube-burner-ocp (20/20). client-go itself defaults to 5/10.
	if [[ -z "${QPS}" ]]; then
		QPS=20
	fi
	if [[ -z "${BURST}" ]]; then
		BURST="${QPS}"
	fi
}

run_workload() {
	local node_count iterations rc user_data_file
	node_count="$(count_selected_nodes)"
	iterations="$(compute_iterations "${node_count}")"
	[[ "${iterations}" -gt 0 ]] || die "computed iterations is 0; increase --pods-per-node"

	resolve_qps_burst
	user_data_file="${WORK_DIR}/user-data.yaml"

	{
		cat <<EOF
JOB_ITERATIONS: ${iterations}
VF_RESOURCE: ${VF_RESOURCE}
QPS: ${QPS}
BURST: ${BURST}
GC: ${GC}
GC_METRICS: false
NAMESPACED_ITERATIONS: true
ITERATIONS_PER_NAMESPACE: 1000
CHURN_CYCLES: 0
CHURN_DURATION: 0s
CHURN_PERCENT: 0
CHURN_DELAY: 0s
CHURN_MODE: namespaces
DELETION_STRATEGY: default
POD_READY_THRESHOLD: 0
SVC_LATENCY: false
EOF
	} >"${user_data_file}"

	log "Running node-density-cni-dpusim"
	log "  kubeconfig:   ${KUBECONFIG_PATH}"
	log "  selector:     ${SELECTOR}"
	log "  nodes:        ${node_count}"
	log "  iterations:   ${iterations} (pods ≈ $((iterations * 2)))"
	log "  vf resource:  ${VF_RESOURCE}"
	log "  qps/burst:    ${QPS}/${BURST}"
	log "  work dir:     ${WORK_DIR}"

	local -a cmd=(
		"${KUBE_BURNER_BIN}" init
		-c "${WORK_DIR}/node-density-cni.yml"
		--kubeconfig "${KUBECONFIG_PATH}"
		--user-data "${user_data_file}"
		--timeout 4h
		--skip-log-file
	)

	(
		cd "${WORK_DIR}"
		"${cmd[@]}"
	) || rc=$?

	if [[ "${rc:-0}" -ne 0 ]]; then
		log "kube-burner run failed (exit ${rc}); recent events:"
		kubectl_host get events -A --sort-by=.lastTimestamp 2>/dev/null | tail -20 || true
		kubectl_host get pods -A | grep node-density-cni || true
		return "${rc}"
	fi

	log "kube-burner run finished"
	kubectl_host get pods -A 2>/dev/null | grep node-density-cni || log "All node-density-cni pods garbage-collected"
}

main() {
	parse_args "$@"

	[[ -f "${KUBECONFIG_PATH}" ]] || die "kubeconfig not found: ${KUBECONFIG_PATH}"
	[[ -d "${TEMPLATE_DIR}" ]] || die "templates missing: ${TEMPLATE_DIR}"

	if [[ "${CLEANUP_ONLY}" -eq 1 ]]; then
		cleanup_namespaces
		log "Cleanup requested"
		return 0
	fi

	install_kube_burner
	prepare_workdir
	preflight
	run_workload
}

main "$@"
