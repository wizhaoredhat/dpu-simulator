import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Box,
  Check,
  Clock3,
  Cpu,
  Github,
  Maximize,
  Network,
  RotateCcw,
  ScanLine,
  X,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import Topology from './Topology';
import PacketJourney from './PacketJourney';
import Quickstart from './Quickstart';
import HardwareComparison from './HardwareComparison';
import { chapters, glossary, PUBLIC_URL, REPO, type Chapter } from './content';

const base = import.meta.env.BASE_URL;
const parseChapter = (): Chapter =>
  chapters.find((c) => c.id === window.location.hash.slice(1))?.id || 'welcome';

function Presenters() {
  return (
    <section className="presenters" aria-label="Meet the presenters">
      <div className="presenter">
        <img src={`${base}brands/redhat.svg`} alt="Red Hat" width="123" height="32" />
        <div>
          <strong>William Zhao</strong>
          <span>Principal Software Engineer, Red Hat</span>
        </div>
      </div>
      <div className="presenter">
        <img src={`${base}brands/nvidia.svg`} alt="NVIDIA" width="123" height="32" />
        <div>
          <strong>Tim Rozet</strong>
          <span>Principal Software Engineer, NVIDIA</span>
        </div>
      </div>
      <div className="presenter-note">
        <span className="status-dot" /> Here for the details?
        <br />
        <span>Let’s open a terminal together.</span>
      </div>
    </section>
  );
}

export default function App() {
  const [chapter, setChapter] = useState<Chapter>(parseChapter);
  const [returnTo, setReturnTo] = useState<Chapter | null>(null);
  const [modal, setModal] = useState<'share' | 'glossary' | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [presentationNotice, setPresentationNotice] = useState('');
  const [resetKey, setResetKey] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const index = chapters.findIndex((c) => c.id === chapter);

  useEffect(() => {
    const change = () => {
      if (!chapters.some((c) => c.id === window.location.hash.slice(1))) return;
      setChapter(parseChapter());
      setReturnTo(null);
    };
    window.addEventListener('hashchange', change);
    const fs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', fs);
    return () => {
      window.removeEventListener('hashchange', change);
      document.removeEventListener('fullscreenchange', fs);
    };
  }, []);
  useEffect(() => {
    document.title = `${chapters[index].label} · dpu-simulator`;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [chapter, index, resetKey]);
  useEffect(() => {
    if (modal) dialog.current?.showModal();
    else dialog.current?.close();
  }, [modal]);

  function navigate(next: Chapter) {
    setReturnTo(null);
    setChapter(next);
    window.history.pushState(null, '', `#${next}`);
  }
  function explore() {
    if (chapter !== 'lab') setReturnTo(chapter);
    setChapter('lab');
    window.history.pushState(null, '', '#lab');
  }
  function reset() {
    setResetKey((k) => k + 1);
    navigate('welcome');
  }
  async function present() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setPresentationNotice(
        'Fullscreen is unavailable here. You can use your browser’s fullscreen control.',
      );
    }
  }

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="header-inner">
          <a
            className="wordmark"
            href="#welcome"
            onClick={(e) => {
              e.preventDefault();
              navigate('welcome');
            }}
            aria-label="dpu-simulator home"
          >
            <span className="brand-mark">
              <Cpu size={24} strokeWidth={1.7} />
            </span>
            <span>
              dpu<span className="wordmark-dash">-</span>simulator
            </span>
          </a>
          <nav className="main-nav" aria-label="Main navigation">
            <button
              className={
                !returnTo && ['welcome', 'networking', 'offload', 'hardware'].includes(chapter)
                  ? 'active'
                  : ''
              }
              onClick={() => navigate('welcome')}
            >
              The tour
            </button>
            <button className={chapter === 'lab' ? 'active' : ''} onClick={explore}>
              Explore topology
            </button>
            <button
              className={chapter === 'quickstart' ? 'active' : ''}
              onClick={() => navigate('quickstart')}
            >
              Quickstart
            </button>
          </nav>
          <div className="header-actions">
            <button
              className="icon-button share-button"
              aria-label="Share this demo"
              onClick={() => setModal('share')}
            >
              <ScanLine size={19} />
            </button>
            <a className="github-link" href={REPO} target="_blank" rel="noreferrer">
              <Github size={18} />
              <span>GitHub</span>
              <ArrowUpRight size={14} />
            </a>
          </div>
        </div>
      </header>

      <div className="tour-bar">
        <div className="tour-bar-inner">
          <nav aria-label="Tour chapters">
            {chapters.map((c, i) => (
              <button
                key={c.id}
                aria-current={chapter === c.id ? 'step' : undefined}
                onClick={() => navigate(c.id)}
              >
                <span className="chapter-number">
                  {i < index ? <Check size={12} /> : String(i + 1).padStart(2, '0')}
                </span>
                <span>{c.label}</span>
                {i < chapters.length - 1 && <span className="chapter-line" />}
              </button>
            ))}
          </nav>
          <button className="text-button reset-button" onClick={reset}>
            <RotateCcw size={14} /> Start over
          </button>
        </div>
      </div>

      <main id="main" className="site-main" key={`${chapter}-${resetKey}`} tabIndex={-1}>
        {chapter === 'welcome' && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <div className="eyebrow">
                  <span className="eyebrow-line" /> AN INTERACTIVE GUIDE TO DPU OFFLOAD
                </div>
                <h1 ref={heading} tabIndex={-1}>
                  A DPU lab.
                  <br />
                  Without the
                  <br />
                  <em>hardware.</em>
                </h1>
                <p className="hero-description">
                  Understand how OVN-Kubernetes moves networking to a DPU. Then bring the
                  architecture to life with containers on your own machine.
                </p>
                <div className="hero-actions">
                  <button className="button primary" onClick={() => navigate('networking')}>
                    Take the tour <ArrowRight size={18} />
                  </button>
                  <button className="button quiet" onClick={explore}>
                    Explore the lab <ArrowUpRight size={18} />
                  </button>
                </div>
                <div className="tour-meta">
                  <span>
                    <Clock3 size={15} /> About 4 minutes
                  </span>
                  <span>No DPU experience needed</span>
                </div>
                <div className="hero-definition">
                  <Cpu size={22} />
                  <p>
                    <strong>What’s a DPU?</strong> A Data Processing Unit is a programmable
                    processor that can take on infrastructure work, including networking, alongside
                    the host.
                  </p>
                </div>
              </div>
              <div className="hero-visual">
                <Topology compact />
                <div className="visual-caption">
                  <span className="caption-rule" /> Real Kubernetes. Real networking software. A
                  software model of the hardware.
                </div>
              </div>
            </section>
            <Presenters />
            <section className="intro-features" aria-label="What you will learn">
              <div>
                <span className="feature-number">01 / UNDERSTAND</span>
                <h3>See what moves.</h3>
                <p>Follow networking from the host to the DPU.</p>
              </div>
              <div>
                <span className="feature-number">02 / EXPLORE</span>
                <h3>Make the connections.</h3>
                <p>Meet the clusters, workers, and virtual cables.</p>
              </div>
              <div>
                <span className="feature-number">03 / BUILD</span>
                <h3>Make it your lab.</h3>
                <p>Start with Kind. Experiment, test, and iterate.</p>
              </div>
            </section>
          </>
        )}

        {(chapter === 'networking' || chapter === 'offload') && (
          <>
            <div className="page-heading">
              <span className="eyebrow">
                {chapter === 'networking'
                  ? '01 / START WITH THE FAMILIAR'
                  : '02 / MOVE THE NETWORKING'}
              </span>
              <h1 ref={heading} tabIndex={-1}>
                {chapter === 'networking'
                  ? 'One packet. Two hosts.'
                  : 'Same applications. A different path.'}
              </h1>
              <p>
                {chapter === 'networking'
                  ? 'Before adding a DPU, see how a packet crosses a conventional OVN-Kubernetes network. The host runs both your application and its switching data path.'
                  : 'A DPU gives networking its own place to run. The application stays on the host while the paired DPU takes on the offload networking path.'}
              </p>
            </div>
            <PacketJourney initialMode={chapter === 'networking' ? 'conventional' : 'offload'} />
            <div className="takeaway">
              <span className="takeaway-icon">
                {chapter === 'networking' ? <Network size={23} /> : <Cpu size={23} />}
              </span>
              <div>
                <span className="eyebrow">THE IDEA TO TAKE WITH YOU</span>
                <h3>
                  {chapter === 'networking'
                    ? 'OVN describes the network. OVS forwards the packets.'
                    : 'Separate application compute from infrastructure work.'}
                </h3>
                <p>
                  {chapter === 'networking'
                    ? 'OVN-Kubernetes turns Kubernetes networking requirements into a virtual network. Open vSwitch (OVS) supplies the switching data path.'
                    : 'dpu-simulator recreates the host/DPU division in software so you can develop and test the integration without a physical DPU. Hardware acceleration and throughput are outside this model.'}
                </p>
              </div>
            </div>
          </>
        )}

        {chapter === 'hardware' && (
          <>
            <div className="page-heading">
              <span className="eyebrow">03 / CONNECT THE MODEL TO THE MACHINE</span>
              <h1 ref={heading} tabIndex={-1}>
                Real hardware. Familiar roles.
              </h1>
              <p>
                A BlueField-3 gives networking its own processor and hardware switch. See how
                dpu-simulator recreates the connections and the OVN-Kubernetes split in Kind.
              </p>
            </div>
            <HardwareComparison />
          </>
        )}

        {chapter === 'lab' && (
          <>
            <div className="page-heading">
              <span className="eyebrow">04 / BRING IT INTO SOFTWARE</span>
              <h1 ref={heading} tabIndex={-1}>
                Two clusters. One place to experiment.
              </h1>
              <p>
                Application hosts on one side. Simulated DPUs on the other. Select a component to
                understand its role, or switch to VMs to see what changes underneath.
              </p>
              {returnTo && (
                <button className="text-button return-button" onClick={() => navigate(returnTo)}>
                  <ArrowLeft size={16} /> Return to your tour
                </button>
              )}
            </div>
            <div className="lab-layout">
              <Topology />
              <aside className="lab-sidebar">
                <span className="eyebrow">THE HARDWARE BECOMES SOFTWARE</span>
                <h2>
                  A useful model.
                  <br />A real environment.
                </h2>
                <div className="mapping-item">
                  <ServerIcon />
                  <div>
                    <h3>Host → a Kubernetes node</h3>
                    <p>Runs your workloads and the DPU-host networking components.</p>
                  </div>
                </div>
                <div className="mapping-item">
                  <Cpu size={23} />
                  <div>
                    <h3>DPU → a paired node</h3>
                    <p>Runs the DPU-side networking components and Open vSwitch.</p>
                  </div>
                </div>
                <div className="mapping-item">
                  <Network size={23} />
                  <div>
                    <h3>Ports → virtual connections</h3>
                    <p>Kind uses veth pairs; VM mode uses virtual NICs and OVS bridges.</p>
                  </div>
                </div>
                <div className="lab-outcome">
                  <h3>What can you do with it?</h3>
                  <p>
                    Explore the architecture, develop OVN-Kubernetes features, and exercise traffic
                    paths in repeatable tests.
                  </p>
                  <p>
                    All networking here runs in software. Use physical hardware to evaluate
                    acceleration and performance.
                  </p>
                </div>
                <button className="text-button" onClick={() => setModal('glossary')}>
                  <BookOpen size={17} /> Decode the terminology <ArrowRight size={16} />
                </button>
                <button className="text-button" onClick={() => navigate('hardware')}>
                  <Cpu size={17} /> Compare with BlueField-3 <ArrowRight size={16} />
                </button>
              </aside>
            </div>
          </>
        )}

        {chapter === 'quickstart' && (
          <>
            <div className="page-heading">
              <span className="eyebrow">05 / YOUR TURN</span>
              <h1 ref={heading} tabIndex={-1}>
                Bring up your own DPU lab.
              </h1>
              <p>
                Start with the Kind example. Build the simulator, deploy the two-cluster
                environment, and inspect the same architecture you just explored.
              </p>
            </div>
            <Quickstart />
            <section className="closing-section">
              <div>
                <span className="eyebrow">KEEP EXPLORING</span>
                <h2>Take the lab with you.</h2>
                <p>
                  Save the tour, browse the source, or come find us for a deeper terminal
                  walkthrough.
                </p>
                <div className="hero-actions">
                  <button className="button primary" onClick={() => setModal('share')}>
                    <ScanLine size={18} /> Share this demo
                  </button>
                  <a className="button secondary" href={REPO} target="_blank" rel="noreferrer">
                    Explore the project <ArrowUpRight size={17} />
                  </a>
                </div>
              </div>
              <QRCodeSVG
                value={PUBLIC_URL}
                size={146}
                marginSize={4}
                title="QR code to the public dpu-simulator tour"
              />
            </section>
            <Presenters />
          </>
        )}

        {chapter !== 'welcome' && (
          <div className="tour-pager">
            <button
              className="button quiet"
              onClick={() => navigate(chapters[Math.max(0, index - 1)].id)}
            >
              <ArrowLeft size={17} /> {chapters[Math.max(0, index - 1)].label}
            </button>
            <span>
              {index + 1} of {chapters.length}
            </span>
            {index < chapters.length - 1 ? (
              <button className="button primary" onClick={() => navigate(chapters[index + 1].id)}>
                {chapters[index + 1].label}
                <ArrowRight size={17} />
              </button>
            ) : (
              <button className="button secondary" onClick={reset}>
                <RotateCcw size={16} /> Back to the beginning
              </button>
            )}
          </div>
        )}
      </main>

      <footer className="site-footer">
        <div>
          <span className="footer-project">
            <Cpu size={17} /> dpu-simulator
          </span>
          <span>An upstream OVN-Kubernetes project</span>
        </div>
        <div>
          <button className="text-button" onClick={() => setModal('glossary')}>
            <BookOpen size={15} /> Glossary
          </button>
          <button className="text-button presentation-button" onClick={present}>
            <Maximize size={15} /> {fullscreen ? 'Exit fullscreen' : 'Present'}
          </button>
          <a href={`${REPO}/blob/main/README.md`} target="_blank" rel="noreferrer">
            Documentation <ArrowUpRight size={14} />
          </a>
        </div>
      </footer>
      {presentationNotice && (
        <p className="presentation-notice" role="status">
          {presentationNotice}
        </p>
      )}

      <dialog
        ref={dialog}
        className="site-dialog"
        onCancel={() => setModal(null)}
        onClose={() => setModal(null)}
        onClick={(e) => {
          if (e.target === dialog.current) {
            const r = dialog.current.getBoundingClientRect();
            if (
              e.clientX < r.left ||
              e.clientX > r.right ||
              e.clientY < r.top ||
              e.clientY > r.bottom
            )
              setModal(null);
          }
        }}
        aria-labelledby="dialog-title"
      >
        <button
          className="icon-button dialog-close"
          aria-label="Close dialog"
          onClick={() => setModal(null)}
        >
          <X size={22} />
        </button>
        {modal === 'share' ? (
          <>
            <span className="eyebrow">A LAB WORTH SHARING</span>
            <h2 id="dialog-title">Pick it up from here.</h2>
            <p>Scan to open the public tour on your device.</p>
            <div className="share-qr">
              <QRCodeSVG value={PUBLIC_URL} size={224} marginSize={4} title="Public demo QR code" />
            </div>
            <a className="public-url" href={PUBLIC_URL} target="_blank" rel="noreferrer">
              {PUBLIC_URL.replace('https://', '')}
              <ArrowUpRight size={16} />
            </a>
            <p className="small-note">
              The QR code points to the configured public site. Opening it requires internet access
              and a published deployment.
            </p>
          </>
        ) : (
          <>
            <span className="eyebrow">A LITTLE CONTEXT GOES A LONG WAY</span>
            <h2 id="dialog-title">The quick glossary.</h2>
            <p>The terms behind the diagrams, in plain language.</p>
            <dl className="glossary">
              {glossary.map(([term, meaning]) => (
                <div key={term}>
                  <dt>{term}</dt>
                  <dd>{meaning}</dd>
                </div>
              ))}
            </dl>
            <a
              href="https://ovn-kubernetes.io/features/hardware-offload/dpu-support/"
              target="_blank"
              rel="noreferrer"
            >
              OVN-Kubernetes DPU documentation <ArrowUpRight size={16} />
            </a>
          </>
        )}
      </dialog>
    </>
  );
}

function ServerIcon() {
  return <Box size={23} />;
}
