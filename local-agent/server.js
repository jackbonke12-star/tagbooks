'use strict';

// TagBooks printer agent.
// Runs on an always-on machine. Connects to the Bambu printer (cloud or LAN MQTT)
// and exposes a small secret-guarded HTTP API the Vercel app proxies to.
// Printing: the uploaded file is saved and served publicly (via the tunnel), and
// a project_file print command is sent over MQTT pointing the printer at that URL.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const fs = require('fs');
const https = require('https');
const express = require('express');
const multer = require('multer');
const mqtt = require('mqtt');

const MODE = (process.env.BAMBU_MODE || 'cloud').toLowerCase();
const SECRET = process.env.AGENT_SHARED_SECRET || '';
const PORT = Number(process.env.AGENT_PORT || 4477);
const SB_URL = 'https://noildgtslvubjkifcifm.supabase.co';
const SB_KEY = 'sb_publishable_n9re43hcpJVeMl-rIUeSYA_U0ldjDSm';

const CLOUD = {
  host: process.env.BAMBU_CLOUD_MQTT || 'us.mqtt.bambulab.com',
  uid: process.env.BAMBU_CLOUD_UID || '',
  token: process.env.BAMBU_CLOUD_TOKEN || '',
  serial: process.env.BAMBU_CLOUD_SERIAL || process.env.BAMBU_SERIAL || '',
};
const LAN = {
  host: process.env.BAMBU_HOST || '',
  code: process.env.BAMBU_ACCESS_CODE || '',
  serial: process.env.BAMBU_SERIAL || '',
};

const SERIAL = MODE === 'cloud' ? CLOUD.serial : LAN.serial;
const REPORT = `device/${SERIAL}/report`;
const REQUEST = `device/${SERIAL}/request`;

const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

let connected = false;
let report = {};
let updatedAt = null;

function deepMerge(target, src) {
  for (const k of Object.keys(src || {})) {
    if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) {
      target[k] = deepMerge(target[k] && typeof target[k] === 'object' ? target[k] : {}, src[k]);
    } else target[k] = src[k];
  }
  return target;
}

// ---- MQTT ----
function connect() {
  const opts =
    MODE === 'cloud'
      ? { username: 'u_' + CLOUD.uid, password: CLOUD.token, rejectUnauthorized: false, reconnectPeriod: 5000, keepalive: 30 }
      : { username: 'bblp', password: LAN.code, rejectUnauthorized: false, reconnectPeriod: 5000, keepalive: 30 };
  const url = MODE === 'cloud' ? `mqtts://${CLOUD.host}:8883` : `mqtts://${LAN.host}:8883`;
  console.log(`[mqtt] ${MODE} connecting to ${url} (device ${SERIAL})`);
  const client = mqtt.connect(url, opts);
  client.on('connect', () => {
    connected = true;
    console.log('[mqtt] connected');
    client.subscribe(REPORT, (e) => e && console.log('[mqtt] subscribe error', e.message));
    client.publish(REQUEST, JSON.stringify({ pushing: { sequence_id: '0', command: 'pushall' } }));
  });
  client.on('message', (_t, buf) => {
    try {
      const msg = JSON.parse(buf.toString());
      if (msg.print) { deepMerge(report, msg.print); updatedAt = new Date().toISOString(); }
    } catch {}
  });
  client.on('error', (e) => console.log('[mqtt] error:', e.message));
  client.on('close', () => { connected = false; console.log('[mqtt] closed'); });
  client.on('reconnect', () => console.log('[mqtt] reconnecting'));
  return client;
}
const client = connect();

function control(action) {
  const cmd =
    action === 'pause' ? { print: { sequence_id: '0', command: 'pause' } }
      : action === 'resume' ? { print: { sequence_id: '0', command: 'resume' } }
      : action === 'stop' ? { print: { sequence_id: '0', command: 'stop' } }
      : null;
  if (!cmd) return false;
  client.publish(REQUEST, JSON.stringify(cmd));
  return true;
}

function status() {
  const p = report || {};
  return {
    connected, mode: MODE,
    state: p.gcode_state || null,
    percent: p.mc_percent ?? null,
    remaining_min: p.mc_remaining_time ?? null,
    nozzle: p.nozzle_temper ?? null, nozzle_target: p.nozzle_target_temper ?? null,
    bed: p.bed_temper ?? null, bed_target: p.bed_target_temper ?? null,
    file: p.subtask_name || p.gcode_file || null,
    layer: p.layer_num ?? null, total_layers: p.total_layer_num ?? null,
    cooling_fan: p.cooling_fan_speed ?? null, updated_at: updatedAt,
  };
}

// current public base URL (the tunnel), read from Supabase so it tracks changes
function publicBase() {
  return new Promise((resolve) => {
    const req = https.get(
      `${SB_URL}/rest/v1/printer_config?id=eq.1&select=agent_url`,
      { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => { try { resolve((JSON.parse(d)[0] || {}).agent_url || ''); } catch { resolve(''); } });
      }
    );
    req.on('error', () => resolve(''));
    req.setTimeout(5000, () => { req.destroy(); resolve(''); });
  });
}

// send a print command that tells the printer to fetch the served file and print it
function sendPrint(fileName, base) {
  const url = `${base.replace(/\/$/, '')}/files/${encodeURIComponent(fileName)}`;
  const cmd = {
    print: {
      sequence_id: '0', command: 'project_file',
      param: 'Metadata/plate_1.gcode', url,
      subtask_name: fileName, md5: '',
      bed_type: 'auto', timelapse: false, bed_leveling: true,
      flow_cali: false, vibration_cali: true, layer_inspect: false,
      use_ams: false,
      profile_id: '0', project_id: '0', subtask_id: '0', task_id: '0',
    },
  };
  client.publish(REQUEST, JSON.stringify(cmd));
  return url;
}

// ---- HTTP ----
const app = express();
const upload = multer({ dest: UPLOAD_DIR, limits: { fileSize: 200 * 1024 * 1024 } });

// public: the printer fetches the sliced file here (no secret)
app.get('/files/:name', (req, res) => {
  const p = path.join(UPLOAD_DIR, path.basename(req.params.name));
  if (!fs.existsSync(p)) return res.status(404).end();
  res.sendFile(p);
});

// everything else requires the shared secret
app.use((req, res, next) => {
  if (req.headers['x-agent-secret'] !== SECRET) return res.status(401).json({ error: 'unauthorized' });
  next();
});

app.get('/health', (_req, res) => res.json({ ok: true, connected }));
app.get('/status', (_req, res) => res.json(status()));
app.post('/control', express.json(), (req, res) => {
  const action = (req.body && req.body.action || '').toLowerCase();
  if (control(action)) return res.json({ ok: true });
  res.status(400).json({ error: 'bad action' });
});

app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  const orig = (req.file.originalname || 'model.3mf').replace(/[^\w.\-]/g, '_');
  const finalPath = path.join(UPLOAD_DIR, orig);
  try { fs.renameSync(req.file.path, finalPath); } catch { /* keep temp name */ }
  const base = await publicBase();
  if (!base) return res.status(200).json({ ok: false, error: 'no public url yet - try again in a moment' });
  if (!/\.3mf$/i.test(orig)) {
    return res.json({ ok: true, uploaded: orig, printed: false, note: 'Saved. Auto-print supports sliced .3mf files; send a .3mf exported from Bambu Studio to start a print.' });
  }
  try {
    const url = sendPrint(orig, base);
    res.json({ ok: true, uploaded: orig, printed: true, url, note: 'Print command sent - watch the printer for the first job.' });
  } catch (e) {
    res.status(200).json({ ok: false, error: 'print command failed: ' + e.message });
  }
});

app.listen(PORT, () => console.log(`[agent] listening on http://localhost:${PORT} (mode=${MODE})`));
