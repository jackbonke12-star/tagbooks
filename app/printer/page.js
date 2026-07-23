'use client';

import './printer.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SPOOLS, spoolPrice } from '../../lib/spoolConfig';

// Read the shared PIN from localStorage at call time (SSR-safe). Sent as the
// x-app-pin header so the printer API routes authorize the proxied request.
function pinHeaders() {
  if (typeof window === 'undefined') return {};
  try {
    const pin = localStorage.getItem('tagbooks-pin');
    return pin ? { 'x-app-pin': pin } : {};
  } catch {
    return {};
  }
}

// Bambu gcode_state -> big status stamp label.
const STATE_LABEL = {
  IDLE: 'IDLE',
  RUNNING: 'PRINTING',
  PAUSE: 'PAUSED',
  FINISH: 'FINISHED',
  FAILED: 'ERROR',
};

// Stamp modifier class per state (color/tilt tuned in printer.css).
const STATE_CLASS = {
  IDLE: 'stamp-idle',
  RUNNING: 'stamp-running',
  PAUSE: 'stamp-paused',
  FINISH: 'stamp-finished',
  FAILED: 'stamp-error',
};

export default function PrinterPage() {
  const [status, setStatus] = useState(null); // last /api/printer/status payload
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false); // a control request in flight
  const [actionError, setActionError] = useState('');
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/printer/status', {
        cache: 'no-store',
        headers: { ...pinHeaders() },
      });
      const data = await res.json();
      setStatus(data);
    } catch {
      // Keep the last good status; a transient fetch blip shouldn't clear it.
      setStatus((prev) => prev || { configured: true, error: 'unreachable' });
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch immediately, then poll every 4s. Clear on unmount.
  useEffect(() => {
    load();
    timerRef.current = setInterval(load, 4000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [load]);

  const control = useCallback(
    async (action) => {
      if (action === 'stop') {
        if (!window.confirm('Stop the current print? This cannot be undone.')) {
          return;
        }
      }
      setActing(true);
      setActionError('');
      try {
        const res = await fetch('/api/printer/control', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...pinHeaders() },
          body: JSON.stringify({ action }),
        });
        const data = await res.json();
        if (!res.ok || data.error || data.ok === false) {
          setActionError('Command failed. The printer may be unreachable.');
        }
      } catch {
        setActionError('Command failed. The printer may be unreachable.');
      } finally {
        setActing(false);
        load();
      }
    },
    [load]
  );

  const configured = status ? status.configured : true;
  const connected = !!(status && status.connected);
  const unreachable = !!(status && status.error === 'unreachable');

  return (
    <div className="printer">
      <div className="printer-head page-head">
        <h1 className="printer-title page-title">3D Printer</h1>
      </div>

      {loading && !status ? (
        <div className="card printer-panel">
          <div className="muted load-line">Loading…</div>
        </div>
      ) : !configured ? (
        <SetupCard />
      ) : (
        <StatusPanel
          status={status}
          connected={connected}
          unreachable={unreachable}
          acting={acting}
          actionError={actionError}
          onControl={control}
        />
      )}

      <SpoolPanel />
    </div>
  );
}

// Calm "not connected yet" card shown when BAMBU_AGENT_URL is unset in Vercel.
function SetupCard() {
  return (
    <div className="card printer-panel">
      <div className="card-label">Printer</div>
      <div className="setup-stamp">Not connected yet</div>
      <p className="setup-note muted">
        The printer lives on the home LAN, so a small local agent runs on the Mac
        and is exposed through a tunnel. Once the agent is running and the Vercel
        env vars <code>BAMBU_AGENT_URL</code> and <code>BAMBU_AGENT_SECRET</code>{' '}
        are set, live status shows here.
      </p>
      <p className="setup-note muted">
        See <code>local-agent/README.md</code> for the steps.
      </p>
    </div>
  );
}

function StatusPanel({ status, connected, unreachable, acting, actionError, onControl }) {
  const rawState = status.state || (connected ? 'IDLE' : null);
  const label = STATE_LABEL[rawState] || (unreachable ? 'OFFLINE' : 'UNKNOWN');
  const stampClass = STATE_CLASS[rawState] || 'stamp-offline';
  const percent = clampPercent(status.percent);
  const running = rawState === 'RUNNING';
  const paused = rawState === 'PAUSE';

  return (
    <div className="card printer-panel">
      <div className="card-label">Status</div>

      {unreachable ? (
        <p className="setup-note muted">
          Agent set, but the printer is unreachable right now. Check the local
          agent and tunnel are running.
        </p>
      ) : null}

      <div className={`state-stamp ${stampClass}`}>{label}</div>

      {/* Progress meter. Reserve height so updates never shift layout. */}
      <div className="printer-progress">
        <div className="goal-track">
          <div
            className="goal-fill"
            style={{ width: `${percent != null ? percent : 0}%` }}
          />
        </div>
        <div className="progress-caption">
          <span>{percent != null ? `${percent}%` : '—'}</span>
          <span>{remainingLabel(status.remaining_min)}</span>
        </div>
      </div>

      {/* Current file */}
      <div className="file-line">
        <span className="file-label">File</span>
        <span className="file-name">{status.file || '—'}</span>
      </div>

      {/* Temp tiles */}
      <div className="temp-grid">
        <TempTile label="Nozzle" actual={status.nozzle} target={status.nozzle_target} />
        <TempTile label="Bed" actual={status.bed} target={status.bed_target} />
        <Tile label="Layer" value={layerLabel(status.layer, status.total_layers)} />
        <Tile label="Fan" value={status.cooling_fan != null ? `${status.cooling_fan}%` : '—'} />
      </div>

      {actionError ? <div className="form-error">{actionError}</div> : null}

      {/* Controls */}
      <div className="printer-controls">
        <button
          type="button"
          className="btn"
          disabled={acting || !running}
          onClick={() => onControl('pause')}
        >
          Pause
        </button>
        <button
          type="button"
          className="btn"
          disabled={acting || !paused}
          onClick={() => onControl('resume')}
        >
          Resume
        </button>
        <button
          type="button"
          className="btn btn-danger"
          disabled={acting || (!running && !paused)}
          onClick={() => onControl('stop')}
        >
          Stop
        </button>
      </div>

      <CameraPanel />

      <SendFilePanel />
    </div>
  );
}

// Live camera view. Fetches the latest JPEG frame (PIN-gated) every ~1.5s and
// swaps it into an <img> via an object URL. Only works when the agent is on the
// printer's LAN (P1 camera is local-only); otherwise shows a calm placeholder.
function CameraPanel() {
  const [src, setSrc] = useState(null);
  const [live, setLive] = useState(false);
  const urlRef = useRef(null);

  useEffect(() => {
    let active = true;
    let timer = null;

    const tick = async () => {
      try {
        const res = await fetch('/api/printer/camera', {
          cache: 'no-store',
          headers: { ...pinHeaders() },
        });
        if (!active) return;
        if (res.ok) {
          const blob = await res.blob();
          if (!active) return;
          const url = URL.createObjectURL(blob);
          if (urlRef.current) URL.revokeObjectURL(urlRef.current);
          urlRef.current = url;
          setSrc(url);
          setLive(true);
        } else {
          setLive(false);
        }
      } catch {
        if (active) setLive(false);
      } finally {
        if (active) timer = setTimeout(tick, 1500);
      }
    };
    tick();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  return (
    <div className="camera-panel">
      <div className="card-label">Camera</div>
      {live && src ? (
        <img className="camera-frame" src={src} alt="Printer camera" />
      ) : (
        <div className="camera-placeholder muted">
          Live view appears when the agent is connected on the printer's local
          network (LAN mode). The Bambu camera is local-only, so it is not
          available over the cloud connection.
        </div>
      )}
    </div>
  );
}

// Send a .3mf / .gcode file to the printer. Only rendered inside StatusPanel,
// i.e. when the printer is configured. Uploading is best-effort: a non-OK
// response (cloud mode can't accept uploads yet) shows a clear LAN-mode hint
// and never crashes the page.
function SendFilePanel() {
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  // 'idle' | 'sending' | 'success' | 'error'
  const [state, setState] = useState('idle');
  const [message, setMessage] = useState('');
  const inputRef = useRef(null);

  const ACCEPT = '.3mf,.gcode';

  function isAllowed(name) {
    const n = (name || '').toLowerCase();
    return n.endsWith('.3mf') || n.endsWith('.gcode');
  }

  function pick(f) {
    if (!f) return;
    if (!isAllowed(f.name)) {
      setFile(null);
      setState('error');
      setMessage('Only .3mf and .gcode files are supported.');
      return;
    }
    setFile(f);
    setState('idle');
    setMessage('');
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    pick(f);
  }

  async function send() {
    if (!file || state === 'sending') return;
    setState('sending');
    setMessage('');
    try {
      const body = new FormData();
      body.append('file', file, file.name);
      const res = await fetch('/api/printer/upload', {
        method: 'POST',
        headers: { ...pinHeaders() },
        body,
        cache: 'no-store',
      });
      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }
      if (res.ok && !data.error) {
        setState('success');
        setMessage(`Sent ${file.name} to the printer.`);
        setFile(null);
        if (inputRef.current) inputRef.current.value = '';
      } else {
        // Includes cloud-mode uploads the agent can't accept yet.
        setState('error');
        setMessage(
          'File send needs the printer on the local network (LAN mode) - status and controls work over cloud.'
        );
      }
    } catch {
      setState('error');
      setMessage(
        'File send needs the printer on the local network (LAN mode) - status and controls work over cloud.'
      );
    }
  }

  return (
    <div className="send-file">
      <div className="card-label">Send a file</div>

      <ol className="print-steps">
        <li>Slice the model in Bambu Studio and export a sliced <strong>.3mf</strong>.</li>
        <li>Drop it below (or tap to choose), then hit <strong>Send to printer</strong>.</li>
        <li>Watch the status above: within a few minutes it turns to <strong>Running</strong> with the temps climbing and the percent ticking up.</li>
        <li>Only sliced <strong>.3mf</strong> files start a print; raw .gcode is just saved.</li>
        <li>If nothing starts after about 5 minutes, the printer did not take the command &mdash; tell Jack and he will adjust it.</li>
      </ol>

      <div
        className={'send-drop' + (dragging ? ' dragging' : '')}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current && inputRef.current.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (inputRef.current) inputRef.current.click();
          }
        }}
      >
        <span className="send-drop-main">
          {file ? file.name : 'Drop a .3mf or .gcode file, or tap to choose'}
        </span>
        <span className="send-drop-sub muted">
          For 3D models and manual test / R&amp;D files
        </span>
        <input
          ref={inputRef}
          className="send-input"
          type="file"
          accept={ACCEPT}
          onChange={(e) => pick(e.target.files && e.target.files[0])}
        />
      </div>

      <div className="send-actions">
        <button
          type="button"
          className="btn btn-primary send-btn"
          disabled={!file || state === 'sending'}
          onClick={send}
        >
          {state === 'sending' ? 'Sending…' : 'Send to printer'}
        </button>
      </div>

      {/* Reserved status line so success/error text never shifts layout. */}
      <div
        className={
          'send-status' +
          (state === 'error' ? ' is-error' : '') +
          (state === 'success' ? ' is-success' : '')
        }
      >
        {message}
      </div>
    </div>
  );
}

function TempTile({ label, actual, target }) {
  return (
    <div className="stat-tile">
      <div className="stat-tile-label">{label}</div>
      <div className="stat-tile-value temp-value">
        <span>{actual != null ? `${Math.round(actual)}°` : '—'}</span>
        <span className="temp-target">
          / {target != null ? `${Math.round(target)}°` : '—'}
        </span>
      </div>
    </div>
  );
}

function Tile({ label, value }) {
  return (
    <div className="stat-tile">
      <div className="stat-tile-label">{label}</div>
      <div className="stat-tile-value">{value}</div>
    </div>
  );
}

// Reference filament list from lib/spoolConfig.js (placeholder data).
function SpoolPanel() {
  return (
    <div className="card printer-panel">
      <div className="card-label">Filament</div>
      <div className="spool-list">
        {SPOOLS.map((s) => (
          <div className="spool-row" key={s.id}>
            <span
              className="spool-swatch"
              style={{ background: s.colorHex }}
              aria-hidden="true"
            />
            <span className="spool-name">{s.name}</span>
            <span className="spool-price">{spoolPrice(s)}</span>
          </div>
        ))}
      </div>
      <p className="spool-note muted">Placeholder prices - update later.</p>
    </div>
  );
}

// --- helpers ---

function clampPercent(v) {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function remainingLabel(min) {
  if (min == null || !Number.isFinite(Number(min))) return '';
  const m = Math.max(0, Math.round(Number(min)));
  if (m < 60) return `${m} min left`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${h}h ${rem}m left`;
}

function layerLabel(layer, total) {
  if (layer == null && total == null) return '—';
  return `${layer != null ? layer : '—'} / ${total != null ? total : '—'}`;
}
