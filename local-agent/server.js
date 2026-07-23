// TagBooks Printer Agent
//
// Runs on the user's Mac (NOT on Vercel). It sits on the same LAN as the Bambu
// Lab printer (default 10.0.0.214), talks to it over MQTT (status + control)
// and FTPS (file upload), and exposes a small HTTP API guarded by a shared
// secret. The Vercel app reaches this agent through a public tunnel URL.
//
// Plain CommonJS. Relies on the repo root node_modules (Node resolves upward),
// so no local install is needed as long as this lives inside the repo.

const path = require('path');
const express = require('express');
const mqtt = require('mqtt');
const multer = require('multer');
const { Client: FtpClient } = require('basic-ftp');
const { Readable } = require('stream');

// Load env from local-agent/.env regardless of the cwd it was launched from.
require('dotenv').config({ path: path.join(__dirname, '.env') });

const {
  BAMBU_HOST,
  BAMBU_SERIAL,
  BAMBU_ACCESS_CODE,
  AGENT_SHARED_SECRET,
} = process.env;
const AGENT_PORT = Number(process.env.AGENT_PORT) || 4477;

if (!BAMBU_HOST || !BAMBU_SERIAL || !BAMBU_ACCESS_CODE || !AGENT_SHARED_SECRET) {
  console.warn(
    '[agent] Missing one or more required env vars ' +
      '(BAMBU_HOST, BAMBU_SERIAL, BAMBU_ACCESS_CODE, AGENT_SHARED_SECRET). ' +
      'Copy .env.example to .env and fill it in.'
  );
}

const REPORT_TOPIC = `device/${BAMBU_SERIAL}/report`;
const REQUEST_TOPIC = `device/${BAMBU_SERIAL}/request`;

// ---------------------------------------------------------------------------
// Running printer state. Reports arrive partial, so we deep-merge each one
// into a single running object and derive a friendly subset on read.
// ---------------------------------------------------------------------------

let mqttClient = null;
let connected = false;
let updatedAt = null;
const state = {}; // merged raw report payload

// Recursive merge so partial `print` updates don't wipe earlier fields.
function deepMerge(target, source) {
  if (!source || typeof source !== 'object') return target;
  for (const key of Object.keys(source)) {
    const val = source[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      if (!target[key] || typeof target[key] !== 'object') target[key] = {};
      deepMerge(target[key], val);
    } else {
      target[key] = val;
    }
  }
  return target;
}

// Bambu gcode_state -> our simplified status vocabulary.
function friendlyStatus() {
  const p = state.print || {};
  return {
    connected,
    state: p.gcode_state || null, // IDLE / RUNNING / PAUSE / FINISH / FAILED
    percent: numOrNull(p.mc_percent),
    remaining_min: numOrNull(p.mc_remaining_time),
    nozzle: numOrNull(p.nozzle_temper),
    nozzle_target: numOrNull(p.nozzle_target_temper),
    bed: numOrNull(p.bed_temper),
    bed_target: numOrNull(p.bed_target_temper),
    file: p.gcode_file || p.subtask_name || null,
    layer: numOrNull(p.layer_num),
    total_layers: numOrNull(p.total_layer_num),
    cooling_fan: numOrNull(p.cooling_fan_speed),
    updated_at: updatedAt,
  };
}

function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// MQTT connection to the printer. Self-signed cert -> rejectUnauthorized:false.
// ---------------------------------------------------------------------------

function connectMqtt() {
  const url = `mqtts://${BAMBU_HOST}:8883`;
  console.log(`[mqtt] connecting to ${url} ...`);

  const client = mqtt.connect(url, {
    username: 'bblp',
    password: BAMBU_ACCESS_CODE,
    rejectUnauthorized: false,
    reconnectPeriod: 5000,
    connectTimeout: 10000,
  });

  client.on('connect', () => {
    connected = true;
    console.log('[mqtt] connected');
    client.subscribe(REPORT_TOPIC, (err) => {
      if (err) {
        console.error('[mqtt] subscribe failed:', err.message);
        return;
      }
      console.log(`[mqtt] subscribed to ${REPORT_TOPIC}`);
      // Ask for a full status dump (reports afterwards are partial deltas).
      publish({ pushing: { sequence_id: '0', command: 'pushall' } });
    });
  });

  client.on('message', (topic, buf) => {
    if (topic !== REPORT_TOPIC) return;
    try {
      const payload = JSON.parse(buf.toString());
      deepMerge(state, payload);
      updatedAt = new Date().toISOString();
    } catch (e) {
      console.warn('[mqtt] bad report payload:', e.message);
    }
  });

  client.on('reconnect', () => console.log('[mqtt] reconnecting ...'));
  client.on('close', () => {
    connected = false;
    console.log('[mqtt] connection closed');
  });
  client.on('error', (err) => {
    connected = false;
    console.error('[mqtt] error:', err.message);
  });

  mqttClient = client;
}

// Publish a JSON command to the printer's request topic.
function publish(obj) {
  if (!mqttClient || !connected) {
    console.warn('[mqtt] publish skipped, not connected');
    return false;
  }
  try {
    mqttClient.publish(REQUEST_TOPIC, JSON.stringify(obj));
    return true;
  } catch (e) {
    console.error('[mqtt] publish error:', e.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// FTPS upload to the printer (implicit TLS on port 990, self-signed cert).
// ---------------------------------------------------------------------------

async function uploadToPrinter(buffer, filename) {
  const client = new FtpClient(15000); // 15s timeout
  client.ftp.verbose = false;
  try {
    await client.access({
      host: BAMBU_HOST,
      port: 990,
      user: 'bblp',
      password: BAMBU_ACCESS_CODE,
      secure: 'implicit',
      secureOptions: { rejectUnauthorized: false },
    });
    // Printers accept uploads at the root; keep it simple and predictable.
    await client.uploadFrom(Readable.from(buffer), filename);
  } finally {
    client.close();
  }
}

// ---------------------------------------------------------------------------
// HTTP API. Every route requires the shared secret header.
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB ceiling for .3mf/.gcode
});

// Guard: x-agent-secret must match AGENT_SHARED_SECRET (else 401).
app.use((req, res, next) => {
  const secret = req.get('x-agent-secret');
  if (!AGENT_SHARED_SECRET || secret !== AGENT_SHARED_SECRET) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  next();
});

app.get('/health', (req, res) => {
  res.json({ ok: true, connected });
});

app.get('/status', (req, res) => {
  const f = friendlyStatus();
  res.json({ ...f, raw: state.print || null });
});

app.post('/control', (req, res) => {
  const action = req.body && req.body.action;
  let cmd = null;
  if (action === 'pause') cmd = { print: { sequence_id: '0', command: 'pause' } };
  else if (action === 'resume') cmd = { print: { sequence_id: '0', command: 'resume' } };
  else if (action === 'stop') cmd = { print: { sequence_id: '0', command: 'stop' } };
  else return res.status(400).json({ ok: false, error: 'bad action' });

  const sent = publish(cmd);
  if (!sent) return res.status(503).json({ ok: false, error: 'printer not connected' });
  res.json({ ok: true });
});

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'no file' });
    const filename = req.file.originalname || 'upload.3mf';
    await uploadToPrinter(req.file.buffer, filename);

    // TODO: issue a project_file / print-start command to actually begin the
    // print from the uploaded file. This is model-specific (X1 vs P1 vs A1)
    // and the request payload (project_file with param/url/subtask_name/md5)
    // varies. Left as a deliberate stub so we don't send a fragile guess that
    // could misbehave on the hardware. Upload alone succeeds today.

    res.json({ ok: true, filename });
  } catch (e) {
    console.error('[upload] failed:', e.message);
    res.status(500).json({ ok: false, error: e.message || 'upload failed' });
  }
});

// Never let a malformed request hang; multer/other errors land here.
app.use((err, req, res, next) => {
  console.error('[agent] request error:', err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ ok: false, error: err.message || 'server error' });
});

app.listen(AGENT_PORT, () => {
  console.log(`[agent] listening on http://localhost:${AGENT_PORT}`);
  connectMqtt();
});
