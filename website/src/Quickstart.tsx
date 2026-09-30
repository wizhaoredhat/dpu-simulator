import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, Copy, GitBranch, Terminal } from 'lucide-react';
import { quickstart, REPO } from './content';

export const CI_URL =
  'https://github.com/ovn-kubernetes/ovn-kubernetes/actions/workflows/kind-dpu-offload.yml';

export function CILink({ compact = false }: { compact?: boolean }) {
  return (
    <aside className={`ci-evidence ${compact ? 'ci-compact' : ''}`}>
      <div className="ci-icon">
        <GitBranch size={23} />
      </div>
      <div>
        <span className="eyebrow">FROM YOUR LAB TO UPSTREAM CI</span>
        <h3>See the same idea working in CI.</h3>
        <p>
          OVN-Kubernetes uses dpu-simulator to build Kind DPU environments and run traffic flow
          tests, including overlay and no-overlay lanes.
        </p>
        {!compact && (
          <div className="ci-pipeline">
            <span>OVN-K source</span>
            <span aria-hidden="true">→</span>
            <span>Kind DPU lab</span>
            <span aria-hidden="true">→</span>
            <span>Traffic tests</span>
          </div>
        )}
        <a href={CI_URL} target="_blank" rel="noreferrer">
          Explore the DPU Offload workflow <ArrowUpRight size={16} />
        </a>
        <small>Opens GitHub for current runs and results · internet required</small>
      </div>
    </aside>
  );
}

function Command({ value, label }: { value: string; label: string }) {
  const [status, setStatus] = useState('');
  const code = useRef<HTMLElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus('Copied');
    } catch {
      const range = document.createRange();
      range.selectNodeContents(code.current!);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      setStatus('Selected — press Ctrl/Cmd+C to copy');
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(''), 3500);
  }
  return (
    <div className="command-block">
      <div className="command-header">
        <span>
          <Terminal size={14} /> terminal
        </span>
        <button onClick={copy} aria-label={`Copy commands: ${label}`}>
          {status === 'Copied' ? <Check size={14} /> : <Copy size={14} />}
          {status === 'Copied' ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre tabIndex={0} aria-label={label}>
        <code ref={code}>{value}</code>
      </pre>
      <span className="copy-status" role="status">
        {status}
      </span>
    </div>
  );
}

export default function Quickstart() {
  return (
    <div className="quickstart-layout">
      <aside className="prerequisites">
        <span className="eyebrow">BEFORE YOU BEGIN</span>
        <h3>
          A Linux machine.
          <br />A little curiosity.
        </h3>
        <p>Use a dedicated lab environment with host-visible container bridge networking.</p>
        <ul>
          <li>Fedora, RHEL, or CentOS Linux</li>
          <li>At least 8 GB RAM; leave space for images and builds</li>
          <li>Go 1.25.3+, Make, Git, and libvirt development headers for the build</li>
          <li>Docker, or supported Podman bridge networking</li>
          <li>Sudo access for dependencies and host networking</li>
          <li>Internet for source, packages, and container images</li>
        </ul>
        <p className="small-note">
          Runtime dependencies are checked during deployment. Rootless Podman with pasta is not
          supported for this offload topology.
        </p>
        <a href={`${REPO}#prerequisites`} target="_blank" rel="noreferrer">
          Full prerequisites <ArrowUpRight size={15} />
        </a>
        <a
          href={`${REPO}/blob/main/config-kind-ovnk-offload.yaml`}
          target="_blank"
          rel="noreferrer"
        >
          Read the example YAML <ArrowUpRight size={15} />
        </a>
      </aside>
      <div className="quickstart-steps">
        {quickstart.map((step, i) => (
          <section className="quickstart-step" key={step.title}>
            <div className="quickstart-heading">
              <span>{String(i + 1).padStart(2, '0')}</span>
              <h3>{step.title}</h3>
            </div>
            <p>{step.description}</p>
            <Command value={step.code} label={step.title} />
            <p className="expected">
              <strong>What to look for</strong> {step.expected}
            </p>
            {step.note && <p className="command-note">{step.note}</p>}
          </section>
        ))}
        <CILink />
      </div>
    </div>
  );
}
