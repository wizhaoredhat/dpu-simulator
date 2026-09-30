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
- `../pkg/deviceplugin/device_plugin.go`: management/workload resource pools;
  exclusion of the gateway and reserved Uplink interfaces.
- `../lib/dpusim/constants.go`: gateway and management interface names.
- `../pkg/config/defaults.go`: DPU gateway network and `eth1` defaults.
- `../cmd/dpu-sim/main.go`: deploy flags and cleanup behavior.
- `../cmd/dpu-sim/tft.go`: virtual environment setup and traffic tests.
- `../go.mod`: Go build version.

## Upstream documentation

- [OVN-Kubernetes DPU support](https://ovn-kubernetes.io/master/features/hardware-offload/dpu-support/)
- [DPU gateway interface configuration](https://ovn-kubernetes.io/features/hardware-offload/dpu-gateway-interface/)
- [Launching OVN-Kubernetes with DPU acceleration](https://ovn-kubernetes.io/master/installation/launching-ovn-kubernetes-with-dpu/):
  management VF pools, per-network management ports, and host-PF/gateway-bridge example.
- [Uplinks for user-defined networks](https://ovn-kubernetes.io/master/features/user-defined-networks/uplinks/):
  host-side discovery and DPU-side bridge resolution; separate Uplink provisioning.
- [NVIDIA BlueField representor model](https://networking-docs.nvidia.com/bsp/453/kernel-representors-model):
  host PF/VF representors, `p0`, and embedded-switch offload versus software forwarding.
- [NVIDIA BlueField OOB interface](https://networking-docs.nvidia.com/bsp/4131/bluefield-oob-ethernet-interface):
  `oob_net0` access to the Arm OS, separate from host/workload interfaces.

## BlueField-3 comparison

The hardware chapter is a representative BlueField-3 in DPU mode using the
PF/VF representor model, aligned with the simulator's two-cluster deployment.
It is an architecture illustration, not a tested hardware installation recipe.
One host/DPU pair and one physical port are expanded. VF numbering, physical
cabling, management access, and bridge layouts vary across installations.

Dashed host-to-representor lines show correspondence, not the offloaded packet
path. The software block programs forwarding; the embedded switch carries
eligible offloaded flows. A separate caption states the direct hardware path.
The simulation uses real software forwarding and simulated device discovery;
it does not emulate PCIe, the BlueField processor, firmware, or performance.

The Kind example reserves index 0 for the host gateway, 1–8 for OVN management,
and 9 for a future Uplink, leaving 10–127 (118 interfaces) for workloads.
Management pool capacity does not imply eight active ports. The baseline names
`eth0-1` explicitly; UDN configurations may allocate from `dpusim.io/mgmtvf`.
A reserved Uplink still requires bridge/network provisioning and API resources.
Kind `eth0` and DPU `eth1` are outside the 128 host-to-DPU pairs. The VM example
instead has 16 pairs, three management reservations, and no Uplink reservation.

Hardware device administration via `oob_net0` is compared with the lab's Kind
node/API connection only by purpose; Kind does not reproduce OOB or BMC hardware.
The host gateway PF and its `pf0hpf` representor are distinguished from the
physical uplink (`p0` in the software view) and the OVN management VFs.

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
connections in the lab overview are explained in the inspector. The hardware
chapter expands gateway, OVN management, and device-management roles separately.

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
