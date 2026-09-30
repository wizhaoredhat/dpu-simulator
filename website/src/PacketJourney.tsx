import { useEffect, useId, useState } from 'react';
import { ArrowLeft, ArrowRight, Pause, Play, RotateCcw } from 'lucide-react';

type Mode = 'conventional' | 'offload';
const stages = ['Pod A', 'Source networking', 'The underlay', 'Destination networking', 'Pod B'];
const descriptions: Record<Mode, string[]> = {
  conventional: [
    'Pod A sends a packet to Pod B on the other host.',
    'Open vSwitch on Host 1 forwards the packet using flows configured by OVN.',
    'The packet travels over the network between the hosts. This example represents an overlay path.',
    'Open vSwitch on Host 2 handles the receiving side and forwards the packet toward Pod B.',
    'Pod B receives the packet. Both application compute and networking ran on the hosts.',
  ],
  offload: [
    'Pod A stays on Host 1. Its network interface connects it to the paired DPU.',
    'DPU 1 provides the switching path. OVN-Kubernetes DPU components configure the networking on this side.',
    'The packet crosses the network between DPUs. On hardware, eligible flows can use the NIC’s acceleration engines.',
    'DPU 2 provides the destination switching path and directs the packet to the host-facing interface.',
    'Pod B receives the packet on Host 2. Application compute stays on the host; the offload networking path lives on the DPU.',
  ],
};
const points = [
  [174, 132],
  [174, 275],
  [450, 275],
  [726, 275],
  [726, 132],
];
const paths = ['M174 172 L174 239', 'M298 279 L361 279', 'M539 279 L599 279', 'M726 239 L726 173'];

export default function PacketJourney({ initialMode }: { initialMode: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const arrowId = useId().replaceAll(':', '');
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      setReduced(query.matches);
      if (query.matches) setPlaying(false);
    };
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!playing || step === 4) return;
    const timer = window.setTimeout(() => {
      setStep((s) => s + 1);
      if (step === 3) setPlaying(false);
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [playing, step]);
  const changeMode = (value: Mode) => {
    setMode(value);
    setStep(0);
    setPlaying(false);
  };
  const seek = (value: number) => {
    setStep(value);
    setPlaying(false);
  };
  const offload = mode === 'offload';
  const active = (n: number) => (step === n ? ' active-stage' : '');

  return (
    <div className="packet-exhibit">
      <div className="diagram-toolbar">
        <span className="diagram-title">FOLLOW ONE PACKET</span>
        <div className="segmented" aria-label="Networking architecture">
          <button aria-pressed={!offload} onClick={() => changeMode('conventional')}>
            Conventional
          </button>
          <button aria-pressed={offload} onClick={() => changeMode('offload')}>
            DPU offload
          </button>
        </div>
      </div>
      <div className="packet-model-caption">
        <span className={`model-pill ${offload ? 'green' : 'blue'}`}>
          {offload ? 'Hardware architecture' : 'Conventional OVN-Kubernetes'}
        </span>
        <span>Pod A → Pod B · conceptual overlay path</span>
      </div>
      <svg
        className="packet-diagram"
        viewBox="0 0 900 390"
        role="img"
        aria-label={`${offload ? 'DPU offload' : 'Conventional'} packet path: Pod A, ${offload ? 'DPU 1' : 'Host 1 OVS'}, underlay, ${offload ? 'DPU 2' : 'Host 2 OVS'}, Pod B. Current step: ${stages[step]}.`}
      >
        <defs>
          <marker
            id={arrowId}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a8a2" />
          </marker>
        </defs>
        {[0, 1].map((n) => (
          <g key={n}>
            <rect
              className="host-boundary"
              x={24 + n * 552}
              y="25"
              width="300"
              height={offload ? 160 : 315}
              rx="14"
            />
            <text x={46 + n * 552} y="59" className="svg-label">
              HOST {n + 1}
            </text>
            <text x={302 + n * 552} y="59" textAnchor="end" className="svg-subtitle">
              Application compute
            </text>
            <g className={'packet-pod' + active(n === 0 ? 0 : 4)}>
              <rect x={74 + n * 552} y="95" width="200" height="74" rx="10" />
              <text x={174 + n * 552} y="126" textAnchor="middle" className="svg-title">
                Pod {n === 0 ? 'A' : 'B'}
              </text>
              <text x={174 + n * 552} y="151" textAnchor="middle" className="svg-subtitle">
                Application workload
              </text>
            </g>
            {offload && (
              <>
                <rect
                  className="dpu-boundary"
                  x={24 + n * 552}
                  y="226"
                  width="300"
                  height="114"
                  rx="14"
                />
                <text x={46 + n * 552} y="210" className="svg-link-label">
                  Host ↔ DPU interface
                </text>
              </>
            )}
            <g
              className={`packet-switch ${offload ? 'offload-switch' : ''}${active(n === 0 ? 1 : 3)}`}
            >
              <rect x={54 + n * 552} y="245" width="240" rx="10" height={70} />
              <text x={174 + n * 552} y="274" textAnchor="middle" className="svg-title">
                {offload ? `DPU ${n + 1} · switching` : 'Host · Open vSwitch'}
              </text>
              <text x={174 + n * 552} y="298" textAnchor="middle" className="svg-subtitle">
                {offload ? 'OVN-Kubernetes DPU mode' : 'OVN-managed forwarding'}
              </text>
            </g>
          </g>
        ))}
        <g className={'packet-network' + active(2)}>
          <rect x="367" y="238" width="166" height="80" rx="40" />
          <text x="450" y="274" textAnchor="middle" className="svg-title">
            Underlay
          </text>
          <text x="450" y="297" textAnchor="middle" className="svg-subtitle">
            Network fabric
          </text>
        </g>
        {paths.map((path) => (
          <path key={path} d={path} className="packet-wire" markerEnd={`url(#${arrowId})`} />
        ))}
        <text x="450" y="362" textAnchor="middle" className="svg-link-label">
          {offload
            ? 'Networking moves to the DPU. Your applications stay on the host.'
            : 'Applications and the switching data path share the host.'}
        </text>
        {step > 0 && !reduced && (
          <circle key={`${mode}-${step}`} r="7" className="travel-packet">
            <animateMotion dur="0.8s" path={paths[step - 1]} fill="freeze" />
          </circle>
        )}
        {(step === 0 || reduced) && (
          <circle
            cx={points[step][0]}
            cy={points[step][1] - 38}
            r="6"
            className="packet-position"
          />
        )}
      </svg>
      <ol className="mobile-packet-path" aria-label="Packet path">
        {stages.map((label, n) => (
          <li key={label} className={step === n ? 'current' : ''}>
            <button onClick={() => seek(n)} aria-current={step === n ? 'step' : undefined}>
              <span>{n + 1}</span>
              {n === 1
                ? offload
                  ? 'DPU 1 · switching'
                  : 'Host 1 · Open vSwitch'
                : n === 3
                  ? offload
                    ? 'DPU 2 · switching'
                    : 'Host 2 · Open vSwitch'
                  : label}
            </button>
          </li>
        ))}
      </ol>
      <div className="journey-status" aria-live="polite" aria-atomic="true">
        <span className="step-number">
          0{step + 1}
          <small> / 05</small>
        </span>
        <div>
          <h3>{stages[step]}</h3>
          <p>{descriptions[mode][step]}</p>
        </div>
      </div>
      <div className="playback-controls">
        <div className="playback-actions">
          <button
            className="button primary small"
            onClick={() => {
              if (step === 4) setStep(0);
              setPlaying(!playing);
            }}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
            {playing ? 'Pause' : step === 4 ? 'Play again' : 'Play journey'}
          </button>
          <button
            className="icon-button"
            aria-label="Previous packet step"
            disabled={step === 0}
            onClick={() => seek(step - 1)}
          >
            <ArrowLeft size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Next packet step"
            disabled={step === 4}
            onClick={() => seek(step + 1)}
          >
            <ArrowRight size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Restart packet journey"
            onClick={() => seek(0)}
          >
            <RotateCcw size={17} />
          </button>
        </div>
        <div className="journey-dots" aria-label="Choose packet step">
          {stages.map((name, i) => (
            <button
              key={name}
              aria-label={`Packet step ${i + 1}: ${name}`}
              aria-current={step === i ? 'step' : undefined}
              onClick={() => seek(i)}
            >
              <span />
            </button>
          ))}
        </div>
      </div>
      <p className="diagram-note packet-note">
        {offload
          ? 'In dpu-simulator, software OVS and virtual interfaces model this split. The animation explains responsibilities; it does not measure hardware acceleration.'
          : 'This simplified path highlights pod forwarding. Service routing, gateway variations, and control-plane setup are omitted.'}
        {reduced &&
          ' Reduced motion is enabled; use the step controls or play the static sequence.'}
      </p>
    </div>
  );
}
