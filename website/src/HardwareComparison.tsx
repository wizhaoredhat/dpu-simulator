import { useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowRight, Cable, Cpu, Info, Network, Server, Settings2 } from 'lucide-react';
import {
  hardwareRoles,
  portRoles,
  sourceCode,
  type ComparisonSide,
  type HardwareRole,
} from './hardwareContent';

function Architecture({
  side,
  selected,
  choose,
  explain,
}: {
  side: ComparisonSide;
  selected: HardwareRole;
  choose: (role: HardwareRole) => void;
  explain: () => void;
}) {
  const hardware = side === 'hardware';
  const name = hardware ? 'BlueField-3' : 'Kind';
  function component(role: HardwareRole, label: string, children: ReactNode, className = '') {
    return (
      <button
        type="button"
        className={`hardware-component ${className}`}
        data-role={role}
        aria-pressed={selected === role}
        aria-label={`${name}: ${label}`}
        aria-controls="hardware-inspector"
        onClick={() => choose(role)}
      >
        {children}
      </button>
    );
  }
  return (
    <section className={`architecture-card ${side}`} aria-label={`${name} architecture`}>
      <header className="architecture-heading">
        <span className="architecture-icon">
          {hardware ? <Cpu size={23} /> : <Server size={23} />}
        </span>
        <div>
          <span className="eyebrow">{hardware ? 'PHYSICAL HARDWARE' : 'YOUR SOFTWARE LAB'}</span>
          <h2>{hardware ? 'NVIDIA BlueField-3' : 'dpu-simulator · Kind'}</h2>
        </div>
        <span className="architecture-badge">{hardware ? 'DPU mode' : 'Software'}</span>
      </header>
      <div className="architecture-body">
        <div className="architecture-host">
          <div className="architecture-node-title">
            <Server size={17} />
            <strong>{hardware ? 'Application host' : 'Host container'}</strong>
            <span>Host cluster</span>
          </div>
          <p className="architecture-subtitle">Applications + OVN-Kubernetes DPU-host components</p>
          <div className="function-grid">
            {portRoles.map((port) => (
              <div key={port.id}>
                {component(
                  port.id,
                  `${port.label} host interface`,
                  <>
                    <span className="port-role">{port.label}</span>
                    <strong>{port[side][0]}</strong>
                    <small>
                      {port.id === 'uplink'
                        ? 'Reserved'
                        : port.id === 'pod'
                          ? 'Application traffic'
                          : 'Node infrastructure'}
                    </small>
                  </>,
                  `function-port ${port.id === 'uplink' ? 'reserved-port' : ''}`,
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="interface-mapping" aria-hidden="true">
          <div>
            {portRoles.map((port) => (
              <i key={port.id} className={selected === port.id ? 'selected' : ''} />
            ))}
          </div>
          <span>
            {hardware ? 'PCIe functions ↔ DPU representors' : 'Host veth ends ↔ DPU veth peers'}
          </span>
        </div>
        <div className="architecture-dpu">
          <div className="architecture-node-title">
            <Cpu size={17} />
            <strong>{hardware ? 'BlueField-3 DPU' : 'DPU container'}</strong>
            <span>DPU cluster</span>
          </div>
          <div className="function-grid peer-grid">
            {portRoles.map((port) => (
              <div key={port.id}>
                {component(
                  port.id,
                  `${port.label} DPU interface`,
                  <>
                    <span className="port-role">{port.label}</span>
                    <strong>{port[side][1]}</strong>
                  </>,
                  `function-port ${port.id === 'uplink' ? 'reserved-port' : ''}`,
                )}
              </div>
            ))}
          </div>
          <p className="port-view-caption">
            {hardware
              ? 'OVS port view · VF names use pf0vf<N>'
              : 'Same interface roles · implemented with virtual cables'}
          </p>
          {component(
            'control',
            'Networking control',
            <>
              <Settings2 size={18} />
              <span>
                <strong>{hardware ? 'Arm cores · OVN-K + OVS' : 'OVN-K + OVS processes'}</strong>
                <small>
                  {hardware
                    ? 'Control software + software packet handling'
                    : 'Real networking software in a Kind worker'}
                </small>
              </span>
            </>,
            'architecture-control',
          )}
          <div className="programming-arrow">
            <ArrowDown size={15} />
            <span>
              {hardware ? 'Programs supported flows for offload' : 'Programs software forwarding'}
            </span>
          </div>
          <div
            className={`forwarding-block ${['pod', 'gateway', 'fabric'].includes(selected) ? 'path-selected' : ''}`}
          >
            <Network size={18} />
            <div>
              <strong>{hardware ? 'Embedded hardware switch' : 'OVS software data path'}</strong>
              <span>
                {hardware
                  ? 'Forwards offloaded packets without an Arm CPU hop'
                  : 'Packets are processed by the Linux machine'}
              </span>
            </div>
          </div>
          <div className="wire-arrow" aria-hidden="true">
            <ArrowDown size={18} />
          </div>
          {component(
            'fabric',
            'Network uplink',
            <>
              <Cable size={18} />
              <span>
                <strong>
                  {hardware
                    ? 'Physical network port · p0 uplink representor'
                    : 'eth1 · dpu-sim-gateway network'}
                </strong>
                <small>
                  {hardware
                    ? 'To the network fabric / other DPUs'
                    : 'Software fabric / other DPU containers'}
                </small>
              </span>
            </>,
            'architecture-fabric',
          )}
        </div>
        {component(
          'device',
          'Device management',
          <>
            <Settings2 size={17} />
            <span>
              <strong>
                {hardware ? 'Device management · oob_net0' : 'Lab administration · Kind eth0'}
              </strong>
              <small>
                {hardware
                  ? 'Separate connection to the Arm OS'
                  : 'Node / API connectivity · not hardware OOB emulation'}
              </small>
            </span>
          </>,
          'architecture-device',
        )}
      </div>
      <div className="architecture-footnote">
        <p>
          {hardware
            ? 'Offloaded path: host function → embedded switch → physical port. The representor row above maps interfaces; it is not a list of packet hops.'
            : 'Software path: host veth → DPU peer → OVS → virtual fabric. All nodes run on one Linux machine.'}
        </p>
        <button className="text-button" onClick={explain}>
          Explain the selected role <ArrowDown size={14} />
        </button>
      </div>
    </section>
  );
}

export default function HardwareComparison() {
  const [selected, setSelected] = useState<HardwareRole>('pod');
  const inspectorHeading = useRef<HTMLHeadingElement>(null);
  const info = hardwareRoles[selected];
  const explain = () => {
    inspectorHeading.current?.focus({ preventScroll: true });
    inspectorHeading.current?.scrollIntoView({ block: 'center', behavior: 'instant' });
  };
  return (
    <div className="hardware-exhibit">
      <div className="hardware-intro">
        <span className="model-pill green">One host / DPU pair, expanded</span>
        <p>
          Two clusters in both views. One physical port illustrated. Select a component to highlight
          the matching role.
        </p>
      </div>
      <div className="architecture-comparison">
        <Architecture side="hardware" selected={selected} choose={setSelected} explain={explain} />
        <Architecture
          side="simulation"
          selected={selected}
          choose={setSelected}
          explain={explain}
        />
      </div>
      <section
        className="hardware-inspector"
        id="hardware-inspector"
        aria-label="Selected interface explanation"
      >
        <div className="hardware-selector" role="group" aria-label="Explore interface roles">
          {(
            [
              ['pod', 'Workload'],
              ['management', 'OVN management'],
              ['gateway', 'Host gateway'],
              ['uplink', 'UDN Uplink'],
              ['control', 'Networking control'],
              ['fabric', 'Network uplink'],
              ['device', 'Device management'],
            ] as const
          ).map(([role, label]) => (
            <button key={role} aria-pressed={selected === role} onClick={() => setSelected(role)}>
              {label}
            </button>
          ))}
        </div>
        <div className="hardware-explanation" aria-live="polite" aria-atomic="true">
          <span className="eyebrow">SAME ROLE, DIFFERENT IMPLEMENTATION</span>
          <h2 ref={inspectorHeading} tabIndex={-1}>
            {info.title}
          </h2>
          <p>{info.purpose}</p>
          <div className="hardware-detail-pair">
            <div>
              <h3>
                <Cpu size={17} /> On BlueField-3
              </h3>
              <p>{info.hardware}</p>
            </div>
            <div>
              <h3>
                <Server size={17} /> In the Kind example
              </h3>
              <p>{info.simulation}</p>
            </div>
          </div>
        </div>
        <details className="hardware-details" key={selected}>
          <summary>Names, behavior, and sources</summary>
          <p>{info.detail}</p>
          <div>
            <a href={info.source} target="_blank" rel="noreferrer">
              Hardware / OVN documentation ↗
            </a>
            <a href={sourceCode(info.code)} target="_blank" rel="noreferrer">
              Simulator implementation ↗
            </a>
          </div>
        </details>
      </section>
      <section className="interface-budget" aria-labelledby="interface-budget-title">
        <div className="interface-budget-heading">
          <div>
            <span className="eyebrow">WHY RESERVE INTERFACES?</span>
            <h2 id="interface-budget-title">128 connections. Four jobs.</h2>
          </div>
          <a href={sourceCode('config-kind-ovnk-offload.yaml')} target="_blank" rel="noreferrer">
            Kind example YAML ↗
          </a>
        </div>
        <p>
          Keep node networking available when pods request interfaces. This is the configured
          capacity per host/DPU pair; it does not mean every connection is in use.
        </p>
        <div className="reservation-strip">
          {(
            [
              ['gateway', '1', 'Host gateway', 'Index 0', 'Not in a device-plugin pool'],
              ['management', '8', 'OVN management', 'Indices 1–8', 'dpusim.io/mgmtvf'],
              ['uplink', '1', 'UDN Uplink', 'Index 9', 'Reserved · requires setup'],
              ['pod', '118', 'Workloads', 'Indices 10–127', 'dpusim.io/vf'],
            ] as const
          ).map(([role, count, label, range, pool]) => (
            <button
              key={role}
              aria-pressed={selected === role}
              onClick={() => setSelected(role)}
              aria-controls="hardware-inspector"
            >
              <span className="reservation-count">{count}</span>
              <strong>{label}</strong>
              <span>{range}</span>
              <small>{pool}</small>
            </button>
          ))}
        </div>
        <p className="reservation-note">
          <Info size={16} /> Kind eth0 and the DPU’s eth1 are outside these 128 pairs. The VM
          example has its own counts: 16 pairs, 3 management reservations, no extra Uplink
          reservation.
        </p>
      </section>
      <section className="model-boundaries" aria-label="What the simulation represents">
        <div>
          <span className="eyebrow">WHAT CARRIES OVER</span>
          <h3>The architecture and integration.</h3>
          <p>
            Host/DPU roles, OVN-Kubernetes components, representor-style connections, gateway and
            management-port separation, and real software traffic tests.
          </p>
        </div>
        <ArrowRight size={24} aria-hidden="true" />
        <div>
          <span className="eyebrow">WHAT HARDWARE ADDS</span>
          <h3>The physical device and acceleration.</h3>
          <p>
            PCIe and SR-IOV behavior, Arm execution, firmware, switchdev discovery, hardware flow
            limits, and performance need validation on an actual DPU.
          </p>
        </div>
      </section>
    </div>
  );
}
