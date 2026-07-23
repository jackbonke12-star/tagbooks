'use strict';

// TagBooks printer agent.
// Runs on an always-on machine (Jack's Mac). Connects to the Bambu printer and
// exposes a small secret-guarded HTTP API that the Vercel app proxies to.
// Supports BAMBU_MODE=cloud (Bambu cloud MQTT, works from anywhere) or lan.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const http = require('http');
const mqtt = require('mqtt');

const MODE = (process.env.BAMBU_MODE || 'cloud').toLowerCase();
const SECRET = process.env.AGENT_SHARED_SECRET || '';
const PORT = Number(process.env.AGENT_PORT || 4477);

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

let connected = false;
let report = {};
let updatedAt = null;

function deepMerge(target, src) {
  for (const k of Object.keys(src || {})) {
    if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) {
      target[k] = deepMerge(target[k] && typeof target[k] === 'object' ? target[k] : {}, src[k]);
    } else {
      target[k] = src[k];
    }
  }
  return target;
}

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
    client.subscribe(REPORT, (err) => err && console.log('[mqtt] subscribe error', err.message));
    client.publish(REQUEST, JSON.stringify({ pushing: { sequence_id: '0', command: 'pushall' } }));
  });
  client.on('message', (_t, buf) => {
    try {
      const msg = JSON.parse(buf.toString());
      if (msg.print) {
        deepMerge(report, msg.print);
        updatedAt = new Date().toISOString();
      }
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
    connected,
    mode: MODE,
    state: p.gcode_state || null,
    percent: p.mc_percent ?? null,
    remaining_min: p.mc_remaining_time ?? null,
    nozzle: p.nozzle_temper ?? null,
    nozzle_target: p.nozzle_target_temper ?? null,
    bed: p.bed_temper ?? null,
    bed_target: p.bed_target_temper ?? null,
    file: p.subtask_name || p.gcode_file || null,
    layer: p.layer_num ?? null,
    total_layers: p.total_layer_num ?? null,
    cooling_fan: p.cooling_fan_speed ?? null,
    updated_at: updatedAt,
  };
}

function send(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  if (req.headers['x-agent-secret'] !== SECRET) return send(res, 401, { error: 'unauthorized' });
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true, connected });
  if (req.method === 'GET' && req.url === '/status') return send(res, 200, status());
  if (req.method === 'POST' && req.url === '/control') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      let action = '';
      try { action = (JSON.parse(body || '{}').action || '').toLowerCase(); } catch {}
      if (control(action)) return send(res, 200, { ok: true });
      return send(res, 400, { error: 'bad action' });
    });
    return;
  }
  return send(res, 404, { error: 'not found' });
});

server.listen(PORT, () => console.log(`[agent] listening on http://localhost:${PORT} (mode=${MODE})`));
