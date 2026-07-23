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
const tls = require('tls');
const express = require('express');
const multer = require('multer');
const mqtt = require('mqtt');
const { Client: FtpClient } = require('basic-ftp');

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

// ---- Camera (LAN only) ----
// The Bambu P1 exposes a JPEG stream over TLS on port 6000, authenticated with
// bblp + the access code. Only reachable on the printer's local network, so this
// runs only in LAN mode. Keeps the latest frame in memory.
let latestFrame = null;
let cameraOk = false;

function startCamera() {
  if (MODE !== 'lan' || !LAN.host || !LAN.code) return;
  const connectCam = () => {
    const sock = tls.connect(
      { host: LAN.host, port: 6000, rejectUnauthorized: false, timeout: 15000 },
      () => {
        const auth = Buffer.alloc(80);
        auth.writeUInt32LE(0x40, 0);
        auth.writeUInt32LE(0x3000, 4);
        Buffer.from('bblp').copy(auth, 16);
        Buffer.from(LAN.code).copy(auth, 48);
        sock.write(auth);
      }
    );
    let acc = Buffer.alloc(0);
    let expect = null;
    sock.on('data', (d) => {
      acc = Buffer.concat([acc, d]);
      // frames: 16-byte header (first 4 bytes = jpeg length LE) + jpeg payload
      for (;;) {
        if (expect === null) {
          if (acc.length < 16) break;
          expect = acc.readUInt32LE(0);
          acc = acc.subarray(16);
        }
        if (acc.length < expect) break;
        const jpg = acc.subarray(0, expect);
        acc = acc.subarray(expect);
        expect = null;
        if (jpg.length > 2 && jpg[0] === 0xff && jpg[1] === 0xd8) {
          latestFrame = Buffer.from(jpg);
          cameraOk = true;
        }
      }
    });
    const retry = () => { cameraOk = false; setTimeout(connectCam, 5000); };
    sock.on('error', () => {});
    sock.on('timeout', () => sock.destroy());
    sock.on('close', retry);
  };
  connectCam();
}
startCamera();

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

// LAN: upload the sliced file straight to the printer over FTPS.
async function ftpUpload(localPath, name) {
  const ftp = new FtpClient(15000);
  try {
    await ftp.access({
      host: LAN.host, port: 990, user: 'bblp', password: LAN.code,
      secure: 'implicit', secureOptions: { rejectUnauthorized: false },
    });
    await ftp.uploadFrom(localPath, name);
  } finally {
    ftp.close();
  }
}

// send a project_file print command pointing at the given url
function sendPrint(fileName, url) {
  const cmd = {
    print: {
      sequence_id: '0', command: 'project_file',
      param: 'Metadata/plate_1.gcode', url,
      subtask_name: fileName, md5: '',
      bed_type: 'auto', timelapse: false, bed_leveling: true,
      flow_cali: false, vibration_cali: true, layer_inspect: true,
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

app.get('/health', (_req, res) => res.json({ ok: true, connected, camera: cameraOk }));
app.get('/status', (_req, res) => res.json({ ...status(), camera: cameraOk }));
app.get('/camera', (_req, res) => {
  if (!latestFrame) return res.status(503).json({ error: MODE === 'lan' ? 'no frame yet' : 'camera needs LAN mode' });
  res.set('Content-Type', 'image/jpeg');
  res.set('Cache-Control', 'no-store');
  res.send(latestFrame);
});
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

  if (!/\.3mf$/i.test(orig)) {
    return res.json({ ok: true, uploaded: orig, printed: false, note: 'Saved. Send a sliced .3mf exported from Bambu Studio to start a print.' });
  }

  try {
    if (MODE === 'lan') {
      await ftpUpload(finalPath, orig);
      const url = sendPrint(orig, `ftp:///${orig}`);
      return res.json({ ok: true, uploaded: orig, printed: true, url, note: 'Uploaded to the printer and print started - watch the printer.' });
    }
    // cloud: best-effort; Bambu printers may not fetch an external URL
    const base = await publicBase();
    if (!base) return res.json({ ok: false, error: 'no public url yet - try again in a moment' });
    const url = sendPrint(orig, `${base.replace(/\/$/, '')}/files/${encodeURIComponent(orig)}`);
    return res.json({ ok: true, uploaded: orig, printed: true, url, note: 'Command sent over cloud. If it does not start, the agent must run on the printer network (LAN setup).' });
  } catch (e) {
    return res.status(200).json({ ok: false, error: 'print failed: ' + e.message });
  }
});

app.listen(PORT, () => console.log(`[agent] listening on http://localhost:${PORT} (mode=${MODE})`));
