export const REPO = 'https://github.com/ovn-kubernetes/dpu-simulator';
export const PUBLIC_URL =
  import.meta.env.VITE_PUBLIC_URL || 'https://ovn-kubernetes.github.io/dpu-simulator/';
export const chapters = [
  { id: 'welcome', label: 'The idea', short: 'Start here' },
  { id: 'networking', label: 'On the host', short: 'Conventional' },
  { id: 'offload', label: 'On the DPU', short: 'DPU offload' },
  { id: 'lab', label: 'In your lab', short: 'The simulator' },
  { id: 'quickstart', label: 'Try it yourself', short: 'Quickstart' },
] as const;
export type Chapter = (typeof chapters)[number]['id'];
export type LabMode = 'kind' | 'vm';
export type Selection =
  | 'host-cluster'
  | 'dpu-cluster'
  | 'host-control'
  | 'dpu-control'
  | 'host-1'
  | 'host-2'
  | 'dpu-1'
  | 'dpu-2'
  | 'pod-1'
  | 'pod-2'
  | 'link-1'
  | 'link-2'
  | 'underlay';

export function describeNode(id: Selection, mode: LabMode) {
  const runtime = mode === 'kind' ? 'Kind container' : 'libvirt/QEMU virtual machine';
  const example = mode === 'kind' ? 'config-kind-ovnk-offload.yaml' : 'config-ovnk-offload.yaml';
  if (id === 'host-cluster')
    return {
      title: 'The host cluster',
      label: 'WORKLOADS LIVE HERE',
      text: 'This Kubernetes cluster schedules your application pods. Its workers run OVN-Kubernetes in DPU-host mode and pair with workers in the DPU cluster.',
      detail:
        'The example names this cluster dpu-sim-host. Multus and the simulator device plugin connect eligible workloads to the offload path.',
      source: example,
    };
  if (id === 'dpu-cluster')
    return {
      title: 'The DPU cluster',
      label: 'NETWORKING LIVES HERE',
      text: 'This separate Kubernetes cluster manages the simulated DPU workers. OVN-Kubernetes in DPU mode and Open vSwitch run here to provide networking for the host workloads.',
      detail:
        'Flannel supplies the DPU cluster’s own primary pod network in the example. OVN-Kubernetes handles the host workload offload separately. This is the selected demo topology.',
      source: 'pkg/cni/ovn_kubernetes.go',
    };
  if (id.endsWith('control'))
    return {
      title: id === 'host-control' ? 'Host control plane' : 'DPU control plane',
      label: 'KUBERNETES MANAGEMENT',
      text: `A dedicated ${runtime} runs this cluster’s Kubernetes control plane. The API server coordinates cluster state; it is not a hop in the workload packet journey.`,
      detail:
        'The two clusters have separate API servers and kubeconfig files. The DPU-side OVN components also watch host-cluster resources to configure workload networking.',
      source: mode === 'kind' ? 'pkg/kind/cluster.go' : 'pkg/k8s/install.go',
    };
  if (id.startsWith('host-'))
    return {
      title: `Host ${id.slice(-1)}`,
      label: 'APPLICATION COMPUTE',
      text: `A ${runtime} plays the role of a Kubernetes host. Your application pod stays here while the paired DPU provides the offload networking path.`,
      detail:
        mode === 'kind'
          ? 'OVN-Kubernetes DPU-host components coordinate pod interface setup. Config names host-1-1 and host-2-1 are mapped to Kind node names with the dpu-sim.org/node-name label.'
          : 'OVN-Kubernetes DPU-host components coordinate pod interface setup. The VM example names these workers host-1-1 and host-2-1, with a paired DPU guest for each.',
      source: example,
    };
  if (id.startsWith('dpu-'))
    return {
      title: `DPU ${id.slice(-1)}`,
      label: 'SIMULATED DPU',
      text: `A ${runtime} plays the role of the paired DPU. It runs Open vSwitch (OVS), the software switch, and OVN-Kubernetes DPU components.`,
      detail:
        'OVN expresses the virtual network; OVS forwards traffic according to the installed flows. This software environment exercises the split architecture without modeling hardware throughput.',
      source: mode === 'kind' ? 'pkg/kind/cluster.go' : 'pkg/vm/network.go',
    };
  if (id.startsWith('pod'))
    return {
      title: `Application pod ${id.endsWith('1') ? 'A' : 'B'}`,
      label: 'EXAMPLE WORKLOAD',
      text: 'An application runs in the host cluster and uses an interface connected to its paired DPU. The packet journey illustrates communication with a pod on the other host.',
      detail:
        'These pods illustrate a traffic-test workload; deployment alone does not create them. Eligible workloads request dpusim.io/vf resources and use the configured Multus network attachment.',
      source: example,
    };
  if (id.startsWith('link'))
    return {
      title: 'Host-to-DPU connection',
      label: mode === 'kind' ? 'VETH PAIRS' : 'VIRTIO + OVS LINKS',
      text:
        mode === 'kind'
          ? 'A veth pair is a virtual cable: traffic entering one end leaves the other. dpu-simulator connects a host container to its paired DPU container with these links.'
          : 'Virtual NICs connect the host and DPU guests through dedicated host-side Open vSwitch bridges and libvirt networks.',
      detail:
        mode === 'kind'
          ? 'One line groups many interfaces. The Kind example creates 128 pairs: index 0 for the gateway, 8 for management, 1 reserved for an uplink, and the remainder for pod resources. Host eth0-* interfaces pair with DPU rep0-* interfaces.'
          : 'One line groups many interfaces. The VM example creates 16 links per host/DPU pair and reserves 3 management-port interfaces. Dedicated libvirt networks and OVS bridges connect the virtual NICs on the two guests.',
      source: mode === 'kind' ? 'pkg/kind/veth.go' : 'pkg/vm/network.go',
    };
  return {
    title: 'The network between DPUs',
    label: 'WORKLOAD DATA PATH',
    text: 'Traffic crosses the underlay between the two DPU nodes, then reaches the destination host through its paired DPU. The drawing shows a logical connection.',
    detail:
      mode === 'kind'
        ? 'DPU workers attach to a dedicated gateway bridge network, whose addresses become the OVN tunnel endpoints. The Kind network carries cluster management traffic. The host configures forwarding between these networks.'
        : 'The configured Kubernetes underlay connects the virtual machines. OVN networking runs over these software links. This diagram omits gateway and service-routing variations.',
    source: mode === 'kind' ? 'pkg/kind/cluster.go' : 'config-ovnk-offload.yaml',
  };
}

export const glossary = [
  [
    'DPU',
    'Data Processing Unit. A programmable processor alongside a network interface that can take on infrastructure work such as networking.',
  ],
  [
    'OVN-Kubernetes',
    'A Kubernetes networking implementation. It connects Kubernetes intent to OVN’s virtual networks and Open vSwitch forwarding.',
  ],
  ['OVS', 'Open vSwitch, a software switch that forwards packets according to programmed flows.'],
  [
    'Representor',
    'A DPU-side interface representing a host-side port. It lets the switching layer connect that port to the network.',
  ],
  [
    'VF',
    'Virtual Function. A portion of an SR-IOV network device exposed to a workload. The simulator models VF-style resources using software interfaces.',
  ],
  [
    'Multus',
    'A component that lets a pod use additional network attachments. Here it participates in connecting eligible workloads to the offload network.',
  ],
  [
    'Device plugin',
    'A Kubernetes component that advertises allocatable resources. dpu-simulator uses dpusim.io/vf for its simulated pod interfaces.',
  ],
  [
    'Kind',
    'Kubernetes IN Docker. It runs Kubernetes nodes as containers. dpu-simulator can use Docker or a supported Podman bridge configuration.',
  ],
];

export const quickstart = [
  {
    title: 'Get the source & build',
    description:
      'Run these commands on your Linux lab machine. Build both dpu-sim and vmctl from the repository root.',
    code: 'git clone https://github.com/ovn-kubernetes/dpu-simulator.git\ncd dpu-simulator\nmake build',
    expected:
      'The executables are written to bin/. Use the Go version required by go.mod (currently 1.25.3 or newer).',
  },
  {
    title: 'Bring up the Kind lab',
    description: 'This example config creates two clusters and wires two host/DPU worker pairs.',
    code: './bin/dpu-sim --config config-kind-ovnk-offload.yaml',
    expected:
      'The simulator checks dependencies, creates the clusters and connections, then installs the configured networking. It writes separate kubeconfigs under kubeconfig/.',
    note: 'Use a dedicated lab machine with sudo access. Deployment configures host networking and cleans up this configured environment before recreating it. Downloads and image builds require internet access.',
  },
  {
    title: 'Meet the two clusters',
    description:
      'Inspect node readiness and the logical names from the YAML. Each cluster has its own API server.',
    code: 'kubectl --kubeconfig kubeconfig/dpu-sim-host.kubeconfig get nodes -L dpu-sim.org/node-name\nkubectl --kubeconfig kubeconfig/dpu-sim-dpu.kubeconfig get nodes -L dpu-sim.org/node-name\nkubectl --kubeconfig kubeconfig/dpu-sim-host.kubeconfig get pods -A\nkubectl --kubeconfig kubeconfig/dpu-sim-dpu.kubeconfig get pods -A',
    expected:
      'Look for one control plane and two workers per cluster. The labels identify host-1-1 ↔ dpu-1-1 and host-2-1 ↔ dpu-2-1. Check the OVN-Kubernetes and device-plugin pods.',
  },
  {
    title: 'Send real test traffic',
    description:
      'Optional: use the configured Kubernetes Traffic Flow Tests (TFT) to exercise workload connectivity. This step needs Python 3.11 or newer.',
    code: './bin/dpu-sim tft venv\n./bin/dpu-sim tft run --config config-kind-ovnk-offload.yaml --check',
    expected:
      'TFT provisions test workloads using the configured network and simulated VF resource. Review its results; --check exits unsuccessfully if the test checks fail. Results measure this software lab, not DPU hardware performance.',
  },
  {
    title: 'Clean up your lab',
    description: 'Use the same configuration so cleanup targets the Kind environment you created.',
    code: './bin/dpu-sim --config config-kind-ovnk-offload.yaml --cleanup',
    expected: 'The configured Kind clusters and simulator resources are removed.',
    note: 'This deletes workloads in those clusters. Save anything you need before running cleanup.',
  },
];
