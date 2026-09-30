# Architecture and content references

## Repository sources

- `../README.md`: project purpose, modes, prerequisites, architecture, usage.
- `../config-kind-ovnk-offload.yaml`: two clusters, two host/DPU worker pairs,
  128 host-to-DPU links per pair, management/uplink reservations, Flannel on the
  DPU cluster, Multus, `dpusim.io/vf`, and the TFT example.
- `../config-ovnk-offload.yaml`: corresponding VM topology.
- `../pkg/kind/cluster.go`: clusters, node mapping, kubeconfigs, DPU OVS setup.
- `../pkg/kind/veth.go`: veth peers and `eth0-*` / `rep0-*` naming.
- `../pkg/kind/routing.go`: host-visible bridge requirements, rootless pasta
  limitation, and privileged networking operations.
- `../pkg/cni/ovn_kubernetes.go` and `../pkg/cni/helm_values.go`: selecting
  full/DPU-host/DPU modes, OVS external IDs, and networking installation.
- `../pkg/vm/network.go`: virtualized host-to-DPU links.
- `../cmd/dpu-sim/main.go`: deploy flags and cleanup behavior.
- `../cmd/dpu-sim/tft.go`: virtual environment setup and traffic tests.
- `../go.mod`: Go build version.

## Upstream documentation

- [OVN-Kubernetes DPU support](https://ovn-kubernetes.io/master/features/hardware-offload/dpu-support/)
- [DPU gateway interface configuration](https://ovn-kubernetes.io/features/hardware-offload/dpu-gateway-interface/)

## CI used as implementation evidence

- [DPU Offload workflow and current runs](https://github.com/ovn-kubernetes/ovn-kubernetes/actions/workflows/kind-dpu-offload.yml)
- [Successful reference run 36650445575](https://github.com/ovn-kubernetes/ovn-kubernetes/actions/runs/36650445575),
  created 2026-09-30 UTC, OVN-Kubernetes commit
  `a3da71ce8825e0f981f61af207ae7efeffbff2dc`.

The run logs were inspected during implementation. They show the two Kind
clusters, worker/worker2 pairing, 128 data channels per pair, DPU OVS setup,
distinct host and DPU Helm values, and traffic tests in the overlay/no-overlay
jobs. The logs validate the architecture rather than supply an evergreen health
claim. Raw logs and their environment-specific addresses are not bundled.

## Modeling boundaries

The selected demo has two Kubernetes clusters. A control-plane node is shown
for each; it is not part of the animated workload packet path. The DPU-side OVN
components also access host-cluster resources. To limit clutter, management
connections are explained in the inspector instead of drawn alongside the data
path.

In Kind offload mode, the DPU workers also attach to a dedicated gateway bridge
network. Addresses on that network supply their OVN encapsulation IPs. The Kind
network serves cluster management, and host forwarding connects the networks.

The explorer groups the host-to-DPU interfaces into one connection per worker
pair. It does not depict all 128 Kind pairs individually; the VM example uses
16 links per worker pair and 3 management interfaces. Pods A and B represent a
test workload, not pods guaranteed to exist immediately after deployment.

The packet comparison illustrates a conceptual cross-host overlay path in a
conventional deployment and a hardware DPU architecture. Software OVS and virtual
interfaces implement the analogous split in dpu-simulator. The diagram does not
claim that every hardware packet passes through a DPU CPU: eligible flows may be
hardware-offloaded. It omits gateway, service, and no-overlay routing variants.

No performance numbers, fake terminal output, or live status are shown. The
Kind quickstart is validated against the repository CLI and CI usage; building
this website does not provision an additional Kubernetes environment.
