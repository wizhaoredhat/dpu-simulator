import { useState } from 'react';
import { Box, Cable, ChevronRight, CircleHelp, Cpu, Network, Server, Workflow } from 'lucide-react';
import { describeNode, REPO, type LabMode, type Selection } from './content';

export default function Topology({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<LabMode>('kind');
  const [selected, setSelected] = useState<Selection | null>(compact ? null : 'host-1');
  const info = selected && describeNode(selected, mode);
  const pair = selected?.match(/-(1|2)$/)?.[1];
  const choose = (id: Selection) => setSelected(id);
  const selectedClass = (id: Selection) => (selected === id ? ' is-selected' : '');

  return (
    <div className={`topology ${compact ? 'compact' : ''}`}>
      <div className="diagram-toolbar">
        <span className="diagram-title">
          <span className="status-dot" /> {compact ? 'YOUR SOFTWARE LAB' : 'EXPLORE THE TOPOLOGY'}
        </span>
        <div className="segmented" aria-label="Deployment mode">
          <button aria-pressed={mode === 'kind'} onClick={() => setMode('kind')}>
            <Box size={15} /> Kind
          </button>
          <button aria-pressed={mode === 'vm'} onClick={() => setMode('vm')}>
            <Server size={15} /> VMs
          </button>
        </div>
      </div>
      <div className="topology-canvas">
        <div className="runtime-caption">
          <span>
            {mode === 'kind'
              ? 'One Linux machine · Kubernetes nodes as containers'
              : 'One Linux hypervisor · Kubernetes nodes as VMs'}
          </span>
        </div>
        <section
          className={`cluster host-cluster ${selected === 'host-cluster' ? 'cluster-selected' : ''}`}
          aria-label="Host cluster"
        >
          <div className="cluster-heading">
            <button
              className="cluster-name"
              aria-pressed={selected === 'host-cluster'}
              onClick={() => choose('host-cluster')}
            >
              <Network size={17} /> Host cluster
            </button>
            <button
              className={'control-node' + selectedClass('host-control')}
              aria-pressed={selected === 'host-control'}
              onClick={() => choose('host-control')}
            >
              <Workflow size={14} /> Control plane
            </button>
          </div>
          <div className="node-grid">
            {[1, 2].map((n) => (
              <div className={`node-stack ${pair === String(n) ? 'related' : ''}`} key={n}>
                <button
                  className={'topology-node host-node' + selectedClass(`host-${n}` as Selection)}
                  aria-pressed={selected === `host-${n}`}
                  onClick={() => choose(`host-${n}` as Selection)}
                >
                  <Server size={21} />
                  <span>
                    <strong>Host {n}</strong>
                    <small>OVN-K · DPU-host</small>
                  </span>
                  <ChevronRight size={16} />
                </button>
                <button
                  className={'pod-node' + selectedClass(`pod-${n}` as Selection)}
                  aria-pressed={selected === `pod-${n}`}
                  onClick={() => choose(`pod-${n}` as Selection)}
                >
                  <Box size={15} /> Pod {n === 1 ? 'A' : 'B'} <span>workload</span>
                </button>
              </div>
            ))}
          </div>
        </section>
        <div className="links-row">
          {[1, 2].map((n) => (
            <button
              key={n}
              className={`host-dpu-link ${pair === String(n) ? 'related' : ''}${selectedClass(`link-${n}` as Selection)}`}
              aria-pressed={selected === `link-${n}`}
              aria-label={`Inspect host ${n} to DPU ${n} connection`}
              onClick={() => choose(`link-${n}` as Selection)}
            >
              <span className="link-wire" />
              <span className="link-label">
                <Cable size={14} /> {mode === 'kind' ? 'veth pairs' : 'virtio + OVS'}
              </span>
              <span className="link-wire" />
            </button>
          ))}
        </div>
        <section
          className={`cluster dpu-cluster ${selected === 'dpu-cluster' ? 'cluster-selected' : ''}`}
          aria-label="DPU cluster"
        >
          <div className="cluster-heading">
            <button
              className="cluster-name"
              aria-pressed={selected === 'dpu-cluster'}
              onClick={() => choose('dpu-cluster')}
            >
              <Network size={17} /> DPU cluster
            </button>
            <button
              className={'control-node' + selectedClass('dpu-control')}
              aria-pressed={selected === 'dpu-control'}
              onClick={() => choose('dpu-control')}
            >
              <Workflow size={14} /> Control plane
            </button>
          </div>
          <div className="node-grid">
            {[1, 2].map((n) => (
              <button
                key={n}
                className={`topology-node dpu-node ${pair === String(n) ? 'related' : ''}${selectedClass(`dpu-${n}` as Selection)}`}
                aria-pressed={selected === `dpu-${n}`}
                onClick={() => choose(`dpu-${n}` as Selection)}
              >
                <Cpu size={24} />
                <span>
                  <strong>DPU {n}</strong>
                  <small>OVN-K · DPU + OVS</small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
          <button
            className={'underlay-link' + selectedClass('underlay')}
            aria-pressed={selected === 'underlay'}
            onClick={() => choose('underlay')}
          >
            <span />
            <Network size={15} /> Network between DPUs
            <span />
          </button>
        </section>
        <div className="diagram-legend">
          <span>
            <i className="host-key" /> Application hosts
          </span>
          <span>
            <i className="dpu-key" /> Simulated DPUs
          </span>
        </div>
        {!compact && (
          <p className="diagram-note">
            Lines show the workload connections. Each cluster also has management connectivity;
            control planes are not packet hops. Pods A and B illustrate a test workload.
          </p>
        )}
      </div>
      <div className="inspector" aria-live="polite" aria-atomic="true">
        {info ? (
          <>
            <span className="eyebrow">{info.label}</span>
            <h3>{info.title}</h3>
            <p>{info.text}</p>
            {!compact && (
              <details key={`${selected}-${mode}`}>
                <summary>
                  Under the hood <ChevronRight size={15} />
                </summary>
                <p>{info.detail}</p>
                <a href={`${REPO}/blob/main/${info.source}`} target="_blank" rel="noreferrer">
                  See the source <ChevronRight size={14} />
                </a>
              </details>
            )}
          </>
        ) : (
          <p className="inspect-hint">
            <CircleHelp size={17} /> Select a node or connection to see what it does.
          </p>
        )}
      </div>
      {!compact && (
        <div className="runtime-explainer">
          <h3>
            {mode === 'kind'
              ? 'Containers play the hardware roles.'
              : 'Same architecture. Virtual machines underneath.'}
          </h3>
          <p>
            {mode === 'kind'
              ? 'Kind creates real Kubernetes clusters. dpu-simulator adds the virtual cables, configures Open vSwitch, and installs the host and DPU networking components. Everything here runs in software on your Linux machine.'
              : 'Each node is a libvirt/QEMU guest with its own kernel. Dedicated OVS bridges and virtual NICs model host-to-DPU connections. Cloud-init and SSH bootstrap the guests; Kubernetes and the offload split remain the same.'}
          </p>
          <div className="source-link">
            <code>
              {mode === 'kind' ? 'config-kind-ovnk-offload.yaml' : 'config-ovnk-offload.yaml'}
            </code>
            <a
              href={`${REPO}/blob/main/${mode === 'kind' ? 'config-kind-ovnk-offload.yaml' : 'config-ovnk-offload.yaml'}`}
              target="_blank"
              rel="noreferrer"
            >
              View example ↗
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
