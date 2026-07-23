'use client';

import './printer.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SPOOLS, spoolPrice } from '../../lib/spoolConfig';

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
      const res = await fetch('/api/printer/status', { cache: 'no-store' });
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
          headers: { 'content-type': 'application/json' },
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
      <div className="printer-head">
        <h1 className="printer-title">3D Printer</h1>
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
