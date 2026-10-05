#!/usr/bin/env bash
# Deploy OVN-Kubernetes DPU offload on Kind or VMs using values-only mode.
#
# dpu-sim creates the host/DPU clusters, host-to-DPU links, device plugin,
# Multus, and Helm values files; this script completes the external Helm installs
# and post-install steps that values-only mode defers.
#
# Entry points: deploy-kind-ovnk-values-only.sh or deploy-vm-ovnk-values-only.sh.
# Options: --cleanup-only, --skip-build, --skip-infra, --skip-verify, --no-overlay.
# --no-overlay configures VM FRR/BGP and the reserved Uplink network.
# For Kind no-overlay use upstream contrib/kind-dpu-sim-no-overlay.sh.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

MODE="${DPU_SIM_MODE:-kind}"
CONFIG="${DPU_SIM_CONFIG:-config-kind-ovnk-offload.yaml}"
[[ "$CONFIG" = /* ]] || CONFIG="${PROJECT_ROOT}/${CONFIG}"
HOST_CLUSTER="${DPU_SIM_HOST_CLUSTER:-dpu-sim-host}"
DPU_CLUSTER="${DPU_SIM_DPU_CLUSTER:-dpu-sim-dpu}"
KUBECONFIG_DIR="${DPU_SIM_KUBECONFIG_DIR:-kubeconfig}"
[[ "$KUBECONFIG_DIR" = /* ]] || KUBECONFIG_DIR="${PROJECT_ROOT}/${KUBECONFIG_DIR}"
HELM_VALUES_DIR="${KUBECONFIG_DIR}/helm-values"
OVNK_PATH="${OVN_KUBERNETES_PATH:-${PROJECT_ROOT}/ovn-kubernetes}"
OVNK_CHART="${OVNK_PATH}/helm/ovn-kubernetes"

HOST_KUBECONFIG="${KUBECONFIG_DIR}/${HOST_CLUSTER}.kubeconfig"
DPU_KUBECONFIG="${KUBECONFIG_DIR}/${DPU_CLUSTER}.kubeconfig"
HOST_VALUES="${HELM_VALUES_DIR}/${HOST_CLUSTER}-ovn-kubernetes-dpu-host-values.yaml"
DPU_VALUES="${HELM_VALUES_DIR}/${DPU_CLUSTER}-ovn-kubernetes-dpu-values.yaml"
HOST_HELM_BASE="${SCRIPT_DIR}/ovnk-helm-values-host-udn-base.yaml"
DPU_HELM_BASE="${SCRIPT_DIR}/ovnk-helm-values-dpu-udn-base.yaml"

# Must match the deployment config kubernetes.clusters entries.
HOST_POD_CIDR="${DPU_SIM_HOST_POD_CIDR:-10.244.0.0/16}"
HOST_SERVICE_CIDR="${DPU_SIM_HOST_SERVICE_CIDR:-10.245.0.0/16}"
DPU_POD_CIDR="${DPU_SIM_DPU_POD_CIDR:-10.246.0.0/16}"
DPU_SERVICE_CIDR="${DPU_SIM_DPU_SERVICE_CIDR:-10.247.0.0/16}"

POD_READY_TIMEOUT="${POD_READY_TIMEOUT:-25m}"
NODE_READY_TIMEOUT="${NODE_READY_TIMEOUT:-25m}"
HELM_TIMEOUT="${HELM_TIMEOUT:-45m}"

SKIP_BUILD=0
SKIP_INFRA=0
SKIP_VERIFY=0
CLEANUP_ONLY=0
NO_OVERLAY=0
HELM_FEATURE_ARGS=()

log() {
	printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"
}

die() {
	log "ERROR: $*"
	exit 1
}

usage() {
	sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
}

parse_args() {
	while [[ $# -gt 0 ]]; do
		case "$1" in
		--no-overlay)
			NO_OVERLAY=1
			shift
			;;
		--cleanup-only)
			CLEANUP_ONLY=1
			shift
			;;
		--skip-build)
			SKIP_BUILD=1
			shift
			;;
		--skip-infra)
			SKIP_INFRA=1
			shift
			;;
		--skip-verify)
			SKIP_VERIFY=1
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

require_cmd() {
	command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

container_bin() {
	if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
		echo docker
	elif command -v podman >/dev/null 2>&1; then
		echo podman
	else
		die "neither docker nor podman is available"
	fi
}

control_plane_ip() {
 local kubeconfig=$1 ip
 ip=$(kubectl --kubeconfig "${kubeconfig}" get nodes -l node-role.kubernetes.io/control-plane \
   -o 'jsonpath={.items[0].status.addresses[?(@.type=="InternalIP")].address}')
 [[ -n "$ip" && "$ip" != *" "* ]] || die "expected one IPv4 control-plane InternalIP in ${kubeconfig}"
 printf '%s\n' "$ip"
}

apply_external_crds() {
	local kubeconfig=$1
	log "Applying external network policy CRDs on ${HOST_CLUSTER}..."
	kubectl --kubeconfig "${kubeconfig}" apply -f \
		https://raw.githubusercontent.com/kubernetes-sigs/network-policy-api/v0.1.5/config/crd/experimental/policy.networking.k8s.io_adminnetworkpolicies.yaml
	kubectl --kubeconfig "${kubeconfig}" apply -f \
		https://raw.githubusercontent.com/kubernetes-sigs/network-policy-api/v0.1.5/config/crd/experimental/policy.networking.k8s.io_baselineadminnetworkpolicies.yaml
	# Network segmentation starts this informer even without policy objects.
	# Match the version installed by upstream contrib/kind-common.sh.
	kubectl --kubeconfig "${kubeconfig}" apply -f \
		https://raw.githubusercontent.com/k8snetworkplumbingwg/multi-networkpolicy/refs/tags/v1.0.1/scheme.yml
}

helm_install_host_ovnk() {
	local kubeconfig=$1 api_url=$2
	log "Installing OVN-Kubernetes (DPU-host + UDN) on ${HOST_CLUSTER}..."
	(
		cd "${OVNK_CHART}"
		helm upgrade --install ovn-kubernetes . \
			--kubeconfig "${kubeconfig}" \
			--timeout "${HELM_TIMEOUT}" \
			-f "${HOST_HELM_BASE}" \
			--set "k8sAPIServer=${api_url}" \
			--set "podNetwork=${HOST_POD_CIDR}" \
			--set "serviceNetwork=${HOST_SERVICE_CIDR}" \
			-f "${HOST_VALUES}" \
			"${HELM_FEATURE_ARGS[@]}"
	)
}

helm_install_dpu_ovnk() {
	local kubeconfig=$1 api_url=$2
	log "Installing OVN-Kubernetes (DPU + UDN) on ${DPU_CLUSTER}..."
	(
		cd "${OVNK_CHART}"
		helm upgrade --install ovn-kubernetes . \
			--kubeconfig "${kubeconfig}" \
			--timeout "${HELM_TIMEOUT}" \
			-f "${DPU_HELM_BASE}" \
			--set "k8sAPIServer=${api_url}" \
			--set "podNetwork=${DPU_POD_CIDR}" \
			--set "serviceNetwork=${DPU_SERVICE_CIDR}" \
			-f "${DPU_VALUES}" \
			"${HELM_FEATURE_ARGS[@]}"
	)
}

wait_ovnk_pods() {
	local kubeconfig=$1 cluster=$2
	local ds pod_ready_timeout="${POD_READY_TIMEOUT}"

	log "Waiting for OVN-Kubernetes on ${cluster}..."
	if kubectl --kubeconfig "${kubeconfig}" get deployment -n ovn-kubernetes ovnkube-control-plane >/dev/null 2>&1; then
		kubectl --kubeconfig "${kubeconfig}" rollout status deployment/ovnkube-control-plane \
			-n ovn-kubernetes --timeout="${pod_ready_timeout}"
	fi
	for ds in ovnkube-node ovnkube-node-dpu-host ovnkube-node-dpu; do
		if kubectl --kubeconfig "${kubeconfig}" get daemonset -n ovn-kubernetes "${ds}" >/dev/null 2>&1; then
			kubectl --kubeconfig "${kubeconfig}" rollout status "daemonset/${ds}" \
				-n ovn-kubernetes --timeout="${pod_ready_timeout}"
		fi
	done
}

delete_kube_proxy() {
	local kubeconfig=$1
	log "Removing kube-proxy from ${HOST_CLUSTER} (OVN-K handles services on DPU-host)..."
	kubectl --kubeconfig "${kubeconfig}" delete daemonset kube-proxy -n kube-system --ignore-not-found
}

resume_system_deployment() {
	local kubeconfig=$1 namespace=$2 name=$3
	local replicas saved

	if ! kubectl --kubeconfig "${kubeconfig}" get deployment -n "${namespace}" "${name}" >/dev/null 2>&1; then
		log "Deployment ${namespace}/${name} not found, skipping resume"
		return 0
	fi

	saved="$(kubectl --kubeconfig "${kubeconfig}" get deployment -n "${namespace}" "${name}" \
		-o jsonpath='{.metadata.annotations.dpu-sim\.io/suspend-replicas}' 2>/dev/null || true)"
	if [[ -n "${saved}" && "${saved}" != "0" ]]; then
		replicas="${saved}"
	else
		replicas=1
	fi

	log "Resuming ${namespace}/${name} to ${replicas} replica(s)..."
	kubectl --kubeconfig "${kubeconfig}" scale deployment -n "${namespace}" "${name}" --replicas="${replicas}"
	kubectl --kubeconfig "${kubeconfig}" rollout restart deployment -n "${namespace}" "${name}"
	kubectl --kubeconfig "${kubeconfig}" rollout status deployment -n "${namespace}" "${name}" --timeout=10m
}

resume_cluster_system_deployments() {
	local kubeconfig=$1 cluster=$2
	log "Restoring CoreDNS and local-path-provisioner on ${cluster}..."
	resume_system_deployment "${kubeconfig}" kube-system coredns
	resume_system_deployment "${kubeconfig}" local-path-storage local-path-provisioner
}

verify_clusters() {
	log "Waiting for all nodes to become Ready..."
	kubectl --kubeconfig "${HOST_KUBECONFIG}" wait --for=condition=Ready node --all --timeout="${NODE_READY_TIMEOUT}"
	kubectl --kubeconfig "${DPU_KUBECONFIG}" wait --for=condition=Ready node --all --timeout="${NODE_READY_TIMEOUT}"

	log "Cluster summary (${HOST_CLUSTER}):"
	kubectl --kubeconfig "${HOST_KUBECONFIG}" get nodes
	kubectl --kubeconfig "${HOST_KUBECONFIG}" get pods -A | grep -E 'ovn-kubernetes|kube-system|multus' || true

	log "Cluster summary (${DPU_CLUSTER}):"
	kubectl --kubeconfig "${DPU_KUBECONFIG}" get nodes
	kubectl --kubeconfig "${DPU_KUBECONFIG}" get pods -A | grep -E 'ovn-kubernetes|kube-system|kube-flannel' || true
}

ensure_prerequisites() {
	require_cmd kubectl
	require_cmd helm
	case "$MODE" in
	 kind) require_cmd kind ;;
	 vm) require_cmd virsh ;;
	 *) die "DPU_SIM_MODE must be kind or vm" ;;
	esac
	if [[ "$NO_OVERLAY" -eq 1 && "$MODE" != vm ]]; then
	 die "Kind no-overlay uses upstream contrib/kind-dpu-sim-no-overlay.sh"
	fi
	require_cmd git
	require_cmd go
	require_cmd make
	require_cmd ovs-vsctl
	if [[ "$MODE" == vm && "$NO_OVERLAY" -eq 1 ]]; then
		require_cmd python3
		python3 -c "import yaml" || die "VM routing requires python3 PyYAML"
		require_cmd jq
	fi

	[[ -f "${CONFIG}" ]] || die "config not found: ${PROJECT_ROOT}/${CONFIG}"
	[[ -f "${OVNK_CHART}/Chart.yaml" ]] || die "OVN-Kubernetes chart not found at ${OVNK_CHART}; clone ovn-kubernetes or set OVN_KUBERNETES_PATH"
	[[ -f "${HOST_HELM_BASE}" ]] || die "host UDN Helm base values not found: ${HOST_HELM_BASE}"
	[[ -f "${DPU_HELM_BASE}" ]] || die "DPU UDN Helm base values not found: ${DPU_HELM_BASE}"

	if [[ ! -x "${PROJECT_ROOT}/bin/dpu-sim" && "${SKIP_BUILD}" -eq 0 ]]; then
		log "dpu-sim binary missing; will build during deploy"
	fi
}

maybe_fix_docker_image_store() {
	local bin daemon_json
	bin="$(container_bin)"
	[[ "${bin}" == docker ]] || return 0

	daemon_json="/etc/docker/daemon.json"
	if [[ ! -w "${daemon_json}" && ! -w /etc/docker ]]; then
		log "Skipping Docker containerd-snapshotter workaround (no write access to /etc/docker)"
		return 0
	fi

	if [[ -f "${daemon_json}" ]] && grep -q '"containerd-snapshotter"[[:space:]]*:[[:space:]]*false' "${daemon_json}"; then
		return 0
	fi

	log "Applying Docker containerd-snapshotter=false workaround for kind image load..."
	if [[ -s "${daemon_json}" ]] && command -v jq >/dev/null 2>&1; then
		jq '. + {"features":{"containerd-snapshotter": false}}' "${daemon_json}" > /tmp/dpu-sim-daemon.json
	else
		echo '{"features":{"containerd-snapshotter": false}}' > /tmp/dpu-sim-daemon.json
	fi
	cp /tmp/dpu-sim-daemon.json "${daemon_json}"
	systemctl restart docker
}

deploy_infra() {
	log "Deploying ${MODE} infrastructure with dpu-sim (--ovnk-mode values-only)..."
	(
		cd "${PROJECT_ROOT}"
		./bin/dpu-sim \
			--config "${CONFIG}" \
			--ovnk-mode values-only \
			--ovn-kubernetes-path "${OVNK_PATH}"
	)
}

cleanup() {
	if [[ "$MODE" == vm ]]; then
		python3 "${SCRIPT_DIR}/configure-vm-routing.py" --cleanup
		# These files describe the disposable VM deployment.  In particular,
		# known_hosts must not survive VM recreation because libvirt guests get
		# new SSH host keys and StrictHostKeyChecking=accept-new rejects stale
		# entries before the no-overlay setup can reach the guests.
		rm -f \
			"${KUBECONFIG_DIR}/vm-routing/known_hosts" \
			"${KUBECONFIG_DIR}/vm-routing/topology.json" \
			"${KUBECONFIG_DIR}/vm-routing/receive-all.yaml"
	fi
	log "Cleaning up ${MODE} clusters..."
	(
		cd "${PROJECT_ROOT}"
		./bin/dpu-sim --config "${CONFIG}" --cleanup
	)
}

main() {
	parse_args "$@"
	cd "${PROJECT_ROOT}"

	if [[ "${CLEANUP_ONLY}" -eq 1 ]]; then
		ensure_prerequisites
		[[ -x ./bin/dpu-sim ]] || make build
		cleanup
		exit 0
	fi

	ensure_prerequisites
	if [[ "$MODE" == kind ]]; then
		maybe_fix_docker_image_store
	fi

	if [[ "${SKIP_BUILD}" -eq 0 ]]; then
		log "Building dpu-sim..."
		make build
	fi

	if [[ "${SKIP_INFRA}" -eq 0 ]]; then
		deploy_infra
	else
		log "Skipping dpu-sim infrastructure deployment (--skip-infra)"
	fi

	[[ -f "${HOST_KUBECONFIG}" ]] || die "host kubeconfig missing: ${HOST_KUBECONFIG}"
	[[ -f "${DPU_KUBECONFIG}" ]] || die "DPU kubeconfig missing: ${DPU_KUBECONFIG}"
	[[ -f "${HOST_VALUES}" ]] || die "host Helm values missing: ${HOST_VALUES}"
	[[ -f "${DPU_VALUES}" ]] || die "initial DPU Helm values missing: ${DPU_VALUES}"

	local host_api_ip host_api_url
	host_api_ip="$(control_plane_ip "${HOST_KUBECONFIG}")"
	host_api_url="https://${host_api_ip}:6443"
	log "Host cluster internal API server: ${host_api_url}"

	apply_external_crds "${HOST_KUBECONFIG}"
	# The host chart owns the namespace and service account consumed by
	# host-access. Install it first, but defer readiness until DPU OVN is up.
	helm_install_host_ovnk "${HOST_KUBECONFIG}" "${host_api_url}"

	log "Creating host-cluster access credentials for DPU-side OVN-Kubernetes..."
	./bin/dpu-sim ovnk host-access \
		--config "${CONFIG}" \
		--cluster "${HOST_CLUSTER}"

	log "Regenerating DPU-cluster Helm values with host credentials..."
	./bin/dpu-sim ovnk values \
		--config "${CONFIG}" \
		--cluster "${DPU_CLUSTER}" \
		--require-host-credentials

	[[ -f "${DPU_VALUES}" ]] || die "DPU Helm values missing after regeneration: ${DPU_VALUES}"

	local dpu_api_ip dpu_api_url
	dpu_api_ip="$(control_plane_ip "${DPU_KUBECONFIG}")"
	dpu_api_url="https://${dpu_api_ip}:6443"
	log "DPU cluster internal API server: ${dpu_api_url}"

	if [[ "$NO_OVERLAY" -eq 1 ]]; then
		# Match upstream kind-dpu-sim-no-overlay.sh's
		# --route-advertisements-enable --no-overlay-enable
		# --advertise-default-network flags.  The last setting is essential for
		# default-network pod prefixes; without it, BGP can be Established while
		# advertising zero pod routes and only UDN-specific advertisements work.
		HELM_FEATURE_ARGS=(
			--set global.enableRouteAdvertisements=true
			--set global.enableNoOverlay=true
			--set global.advertiseDefaultNetwork=true
		)
		"${SCRIPT_DIR}/configure-vm-routing.sh" "${CONFIG}" "${OVNK_PATH}" "${DPU_VALUES%/*}/${DPU_CLUSTER}-frr-k8s.env" "${DPU_KUBECONFIG}"
		# Enable route-advertisement watches once FRR CRDs exist on both APIs.
		helm_install_host_ovnk "${HOST_KUBECONFIG}" "${host_api_url}"
	fi
	delete_kube_proxy "${HOST_KUBECONFIG}"
	helm_install_dpu_ovnk "${DPU_KUBECONFIG}" "${dpu_api_url}"
	# DPU-host readiness can depend on the DPU agents: install both before waiting.
	wait_ovnk_pods "${HOST_KUBECONFIG}" "${HOST_CLUSTER}"
	wait_ovnk_pods "${DPU_KUBECONFIG}" "${DPU_CLUSTER}"

	resume_cluster_system_deployments "${HOST_KUBECONFIG}" "${HOST_CLUSTER}"
	resume_cluster_system_deployments "${DPU_KUBECONFIG}" "${DPU_CLUSTER}"

	if [[ "${SKIP_VERIFY}" -eq 0 ]]; then
		verify_clusters
	fi

	log "Deployment complete."
	log "  Host kubeconfig: ${HOST_KUBECONFIG}"
	log "  DPU kubeconfig:  ${DPU_KUBECONFIG}"
	log "  Host values:     ${HOST_VALUES}"
	log "  DPU values:      ${DPU_VALUES}"
	log ""
	log "Optional next steps:"
	log "  ./bin/dpu-sim tft venv --config ${CONFIG}"
	log "  ./bin/dpu-sim tft run --config ${CONFIG}"
	log "  ./scripts/deploy-${MODE}-ovnk-values-only.sh --cleanup-only"
}

main "$@"
