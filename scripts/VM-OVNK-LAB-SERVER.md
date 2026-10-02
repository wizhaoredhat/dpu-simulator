# OVN-Kubernetes offload on VMs

Use `config-ovnk-offload.yaml` on a libvirt/KVM host. The VM entry point uses the
same generated Helm values, Multus, simulated device plugin, and OVN-Kubernetes
charts as the Kind entry point:

```bash
./scripts/deploy-vm-ovnk-values-only.sh
./bin/dpu-sim tft venv --config config-ovnk-offload.yaml
./bin/dpu-sim tft run --config config-ovnk-offload.yaml \
  --tft-config ci/tft-config/tft-overlay.yaml --check
```

Set `OVN_KUBERNETES_PATH` to a checkout containing the DPU/Uplink charts.
`DPU_SIM_CONFIG`, `DPU_SIM_HOST_CLUSTER`, `DPU_SIM_DPU_CLUSTER`,
`DPU_SIM_KUBECONFIG_DIR`, and the `DPU_SIM_*_CIDR` settings in the shared helper
must match a customized deployment. Its defaults match the provided examples.
The helper resolves API addresses from Kubernetes Node InternalIPs, so it does
not need a container with a Kind control-plane name.

## VM network layout

Management SSH access uses `mgmt`. Kubernetes advertises its API on `k8s`,
so pod access through the Kubernetes service stays on the reachable underlay.
Boot services activate unmanaged interfaces and restore the host gateway address
before kubelet starts. The OVN host cluster skips kube-proxy at initialization;
the Flannel DPU cluster retains it.
VM offload now creates a dedicated `dpu-sim-gateway` libvirt NAT network
(bridge `dpu-sim-gw`) from `HostToDpu.gateway_subnet`, default `172.30.0.0/24`.
Only paired DPU VMs attach a `gateway` virtio NIC. Kubernetes node IPs and API
connectivity stay on `k8s`; OVN gateway traffic, Geneve encapsulation and FRR
peering use `gateway`. The bridge next hop is `.1`, DPU addresses start at `.2`,
and host gateway VF addresses descend from `.254` (for the default /24).
These are static assignments in configuration pair order, with no DHCP on the
gateway segment. As in Kind, `eth0-0` reaches `rep0-0` through its existing
simulated VF link; it is not directly attached to the shared libvirt bridge.
The host VF no longer needs `noprefixroute`. DPU gateway addresses are restored
by a oneshot boot service before kubelet/CRI-O; OVN can subsequently move them
onto its OVS bridge without a network manager reapplying them.

The simulator installs runtime forwarding exceptions for the Kubernetes and
gateway subnets in libvirt's nftables/iptables rules and the firewalld
zones associated with those bridges. Reapply setup after host firewall reloads or network restarts, as with
Kind's runtime forwarding rules. Guest addresses persist across guest reboots.
The dedicated Uplink network (`layer2`) remains separate.

This is a fresh-deployment change: rebuild old VMs to add the NIC and boot
configuration. Existing lab VMs have not been migrated. The earlier 100-flow
overlay result used the shared-subnet topology and does not validate this one.
Before claiming parity, validate overlay, no-overlay/BGP, explicit Uplink,
API/service access, and guest reboot behavior on the new topology.

The VM example reserves `eth0-0` for the gateway, `eth0-1` through `eth0-8`
for management, and `eth0-9` for Uplink. `eth0-10` through `eth0-127` provide
118 allocatable pod devices per host. This matches the Kind example's reservations and capacity. Full TFT
pre-provisioning keeps default, primary UDN and secondary-network pods alive
together; some pods request seven devices. Smaller pools may work for individual
cases but cannot be assumed to fit the combined profile. Workers use four vCPUs
to provide enough interrupt vectors for the 128 virtio data interfaces; the lab
kernel initialized only 84 with two vCPUs.

## No-overlay, BGP and Uplink

```bash
./scripts/deploy-vm-ovnk-values-only.sh --skip-build --skip-infra --no-overlay
./bin/dpu-sim tft run --config config-ovnk-offload.yaml \
  --tft-config ci/tft-config/tft-no-overlay.yaml --check
```

This enables the OVN route-advertisement/no-overlay features, installs upstream
FRR-K8S with the host-to-DPU remote API mapping, and creates the lab's external
FRR router and HTTP server. It requires root, PyYAML, jq, Podman or Docker, and
the configured SSH key. It uses the FRR version and manifests pinned by the
selected OVN-Kubernetes checkout. `DPU_SIM_CONTAINER_RUNTIME` selects the runtime.

The router connects to the `k8s` Linux bridge and the `layer2` OVS bridge.
Each DPU's `layer2` NIC and reserved representor are attached to `breth-uplink`.
The paired host's reserved interface receives the matching Uplink address.
The Uplink network defaults to `172.31.0.0/24`; the external HTTP server uses
`172.29.0.10:8080`. Set `DPU_SIM_VM_UPLINK_SUBNET` and
`DPU_SIM_VM_EXTERNAL_SUBNET` to nonoverlapping IPv4 /24s when necessary.
These are isolated test networks, with BGP ASN 64512.

Generated topology and FRR artifacts live under `kubeconfig/vm-routing/`.
Guest routing setup lasts until reboot; rerun the helper after restarting VMs.
The helper only replaces containers bearing its ownership label. Cleanup:

```bash
./scripts/deploy-vm-ovnk-values-only.sh --cleanup-only
```

The shared TFT profiles use `@host-1` and `@host-2`, resolved by `dpu-sim tft run`
to paired hosts in config order. Do not pass these profiles directly to `tft.py`.
Explicit node names still work. External profiles can supply their own
`kubeconfig`; relative paths are resolved beside that profile. Otherwise the
runner supplies the deployment kubeconfig and removes its temporary input file
after the run.

The no-overlay TFT profile exercises routed primary UDNs. Uplink-specific
controller and external-traffic checks are separate from that profile; enabling
the Uplink feature or creating its bridge alone is not a traffic-test result.
