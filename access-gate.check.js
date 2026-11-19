// Self-check for the access gate. Run: node access-gate.check.js
const assert = require('node:assert/strict');
const { accessGate } = require('./access-gate');

const OFFICE = '203.0.113.7', OTHER = '198.51.100.9';
function hit(env, { path = '/', method = 'GET', headers = {} } = {}) {
  let status = 200;
  const res = { status(c) { status = c; return this; }, type() { return this; }, send() { return this; } };
  accessGate(env)({ path, method, headers, socket: { remoteAddress: '::ffff:10.0.0.9' } }, res, () => {});
  return status;
}
const on = { ACCESS_GATE: 'on', ALLOWED_IPS: `192.0.2.1, ${OFFICE}`, KEEL_INTERNAL_KEY: 'test-key' };

// Gate off = open, whatever else is set.
assert.equal(hit({}, { headers: { 'x-real-ip': OTHER } }), 200);
assert.equal(hit({ ...on, ACCESS_GATE: undefined }, { headers: { 'x-real-ip': OTHER } }), 200);

// Gate on.
assert.equal(hit(on, { headers: { 'x-real-ip': OFFICE } }), 200);
assert.equal(hit(on, { method: 'POST', path: '/api/x', headers: { 'x-real-ip': OFFICE } }), 200);
assert.equal(hit(on, { headers: { 'x-real-ip': OTHER } }), 403);
assert.equal(hit(on, { path: '/index.html', headers: { 'x-real-ip': OTHER } }), 403); // static frontend too
assert.equal(hit(on, {}), 403); // no header: falls back to the socket address
assert.equal(hit(on, { headers: { 'x-real-ip': OTHER, 'x-keel-key': 'test-key' } }), 200);
assert.equal(hit(on, { headers: { 'x-real-ip': OTHER, 'x-keel-key': 'wrong' } }), 403);
assert.equal(hit(on, { headers: { 'x-real-ip': OTHER, 'x-forwarded-for': OFFICE } }), 403); // spoofed XFF
assert.equal(hit(on, { path: '/api/health', headers: { 'x-real-ip': OTHER } }), 200);
assert.equal(hit(on, { path: '/api/health', method: 'POST', headers: { 'x-real-ip': OTHER } }), 403);
assert.equal(hit(on, { path: '/api/healthz', headers: { 'x-real-ip': OTHER } }), 403);

// On with nothing configured = nobody (an empty key must not match an empty header).
const bare = { ACCESS_GATE: 'on' };
assert.equal(hit(bare, { headers: { 'x-real-ip': OFFICE } }), 403);
assert.equal(hit(bare, { headers: { 'x-real-ip': OFFICE, 'x-keel-key': '' } }), 403);
assert.equal(hit(bare, { path: '/api/health' }), 200);

console.log('access-gate.check ok');
