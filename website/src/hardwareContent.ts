import { REPO } from './content';

export type HardwareRole =
  'pod' | 'management' | 'gateway' | 'uplink' | 'control' | 'fabric' | 'device';
export type ComparisonSide = 'hardware' | 'simulation';

const docs = {
  representors: 'https://networking-docs.nvidia.com/bsp/453/kernel-representors-model',
  dpu: 'https://ovn-kubernetes.io/master/features/hardware-offload/dpu-support/',
  gateway: 'https://ovn-kubernetes.io/master/features/hardware-offload/dpu-gateway-interface/',
  management: 'https://ovn-kubernetes.io/master/installation/launching-ovn-kubernetes-with-dpu/',
  uplink: 'https://ovn-kubernetes.io/master/features/user-defined-networks/uplinks/',
  device: 'https://networking-docs.nvidia.com/bsp/4131/bluefield-oob-ethernet-interface',
};

export const portRoles = [
  {
    id: 'pod',
    label: 'Workload',
    hardware: ['Pod VF', 'VF representor'],
    simulation: ['eth0-10…127', 'rep0-10…127'],
  },
  {
    id: 'management',
    label: 'OVN management',
    hardware: ['Management VF', 'VF representor'],
    simulation: ['eth0-1…8', 'rep0-1…8'],
  },
  {
    id: 'gateway',
    label: 'Host gateway',
    hardware: ['Host PF', 'pf0hpf'],
    simulation: ['eth0-0', 'rep0-0'],
  },
  {
    id: 'uplink',
    label: 'UDN Uplink',
    hardware: ['Reserved VF', 'VF representor'],
    simulation: ['eth0-9', 'rep0-9'],
  },
] as const;

type RoleExplanation = {
  title: string;
  purpose: string;
  hardware: string;
  simulation: string;
  detail: string;
  source: string;
  code: string;
};

export const hardwareRoles: Record<HardwareRole, RoleExplanation> = {
  pod: {
    title: 'Workload interfaces carry application traffic.',
    purpose:
      'A pod runs on the host and gets an interface connected to the paired DPU’s switching path.',
    hardware:
      'An SR-IOV Virtual Function (VF) is assigned to the pod. Its DPU-side representor, named pf0vf<N> in this single-port example, lets OVS manage that function.',
    simulation:
      'A host eth0-* interface and its DPU rep0-* peer form a veth pair. The device plugin offers indices 10–127 to workloads as dpusim.io/vf.',
    detail:
      'A representor is the software handle for a hardware port. The simulation uses a veth peer for that role. Real VF numbers depend on device allocation; simulated index 0 stands in for the host gateway PF, so numeric suffixes are not a one-to-one hardware mapping.',
    source: docs.representors,
    code: 'pkg/deviceplugin/device_plugin.go',
  },
  management: {
    title: 'OVN management ports connect the host to its OVN networks.',
    purpose:
      'Host services need to reach workloads too—for example, a kubelet checking a pod. OVN provides a management port for this host-to-network connection.',
    hardware:
      'A dedicated VF stays on the host for OVN management-port use. Its representor connects to the DPU’s OVN integration bridge. Additional primary user-defined networks can require more management VFs.',
    simulation:
      'Indices 1–8 are kept in the dpusim.io/mgmtvf pool. The baseline uses eth0-1 as the management netdevice; UDN configurations can request management interfaces from the pool.',
    detail:
      'Eight is the configured pool capacity, not eight active management ports. OVN may rename an allocated interface, such as to ovn-k8s-mp0. These interfaces serve host/workload networking; DPU administration and Kubernetes API connectivity are separate roles.',
    source: docs.management,
    code: 'pkg/cni/helm_values.go',
  },
  gateway: {
    title: 'The host gateway port connects the host to the external network.',
    purpose:
      'This is the host-facing side of the gateway path through the DPU. It has a different job from the OVN management port.',
    hardware:
      'In this representative layout, the host uses a Physical Function (PF). Its pf0hpf representor joins the DPU gateway bridge, which also connects to the physical uplink through p0.',
    simulation:
      'eth0-0 ↔ rep0-0 models that PF/representor connection. The host end gets an address on 172.30.0.0/24; the DPU peer is used for the gateway bridge. Index 0 is excluded from both device-plugin pools.',
    detail:
      'A gateway port is an interface; the OVN gateway router is a logical router. Pod traffic can leave through that router on the DPU without passing through the host gateway interface. The simulator supplies rep0-0 explicitly because it has no switchdev hardware metadata.',
    source: docs.gateway,
    code: 'pkg/kind/veth.go',
  },
  uplink: {
    title: 'A reserved Uplink interface leaves room for a dedicated network gateway.',
    purpose:
      'A primary user-defined network can use the OVN-Kubernetes Uplink API to select a separately provisioned external bridge.',
    hardware:
      'One possible layout reserves a host VF and connects its representor to a dedicated DPU gateway bridge. The host publishes interface addressing; the DPU resolves the bridge for the Uplink.',
    simulation:
      'uplink_vfs_count: 1 reserves eth0-9 ↔ rep0-9 after the management range. It belongs to neither device-plugin pool. Reservation alone does not create a working Uplink.',
    detail:
      'Bridge provisioning, addressing, and an Uplink/CUDN configuration are still needed. CUDN means ClusterUserDefinedNetwork. This host-facing reservation is distinct from the DPU’s physical network port and from the default host gateway at index 0.',
    source: docs.uplink,
    code: 'pkg/deviceplugin/device_plugin.go',
  },
  control: {
    title: 'Networking software programs the forwarding path.',
    purpose:
      'The host cluster runs application workloads. The DPU cluster runs the paired networking components, which also observe host-cluster resources.',
    hardware:
      'OVN-Kubernetes and OVS run on the BlueField Arm cores. With offload configured, supported flows are installed in the embedded switch. Software still handles traffic that needs a software path.',
    simulation:
      'A Kind worker runs the DPU-side software. OVS forwards packets in software. --simulate-dpu selects simulated interface discovery while keeping the host/DPU integration under test.',
    detail:
      'The two-cluster arrangement matches the selected simulator example. Kind nodes share the Linux machine’s kernel. The VM variant uses guest kernels and virtual NICs instead; neither variant emulates the BlueField processor or firmware.',
    source: docs.dpu,
    code: 'pkg/cni/helm_values.go',
  },
  fabric: {
    title: 'The network uplink connects the DPU to the fabric.',
    purpose:
      'Packets need a route to other DPUs and external networks. This is the wire-facing connection.',
    hardware:
      'The physical port reaches the network switch. p0 is its uplink representor in the DPU’s software view. Offloaded traffic can move between a host function and the wire in the embedded switch.',
    simulation:
      'The DPU container’s eth1 connects to the dpu-sim-gateway bridge network. Its address also supplies the OVN tunnel endpoint. Linux software networking provides the fabric connection.',
    detail:
      'p0, pf0hpf, and a management VF have different roles: wire-facing uplink, host PF representor, and OVN host-to-workload connection. The picture shows one physical port; cabling and gateway bridge layouts vary by deployment.',
    source: docs.representors,
    code: 'pkg/config/defaults.go',
  },
  device: {
    title: 'Device management reaches the DPU operating system.',
    purpose:
      'An administrator needs access to the DPU itself, independently of a workload’s OVN management port.',
    hardware:
      'BlueField’s oob_net0 provides out-of-band access to the Arm operating system for tasks such as SSH. It is separate from the high-speed data port and host VFs.',
    simulation:
      'Kind eth0 provides node and Kubernetes API connectivity on the Kind network. It serves the lab’s administration needs, but does not emulate BlueField’s physical management port or BMC.',
    detail:
      'Hardware may use OOB or other configured paths for Kubernetes management. In the VM example, a separate management network supports access to guests. Do not confuse Kind eth0 with the simulator’s eth0-0 gateway or eth0-1 management-port netdevice.',
    source: docs.device,
    code: 'README.md',
  },
};

export const sourceCode = (path: string) => `${REPO}/blob/main/${path}`;
