// Access gate, same rule as silkworm-pans: office IP, internal key, or the health check. Everything else gets 403.
// It only enforces when ACCESS_GATE=on, so deploying this changes nothing until the env vars are set.
// Client IP comes from x-real-ip (Railway's edge overwrites it). X-Forwarded-For is client-controlled and never read.
const crypto = require('crypto');

const OPEN = ['/api/health']; // exact paths anyone may GET
const digest = s => crypto.createHash('sha256').update(String(s)).digest();

function accessGate(env = process.env) {
  if (env.ACCESS_GATE !== 'on') return (req, res, next) => next();
  const ips = (env.ALLOWED_IPS || '').split(',').map(s => s.trim()).filter(Boolean); // empty list = nobody gets in by IP
  const key = env.KEEL_INTERNAL_KEY ? digest(env.KEEL_INTERNAL_KEY) : null;
  return (req, res, next) => {
    const ip = String(req.headers['x-real-ip'] || req.socket.remoteAddress || '').replace(/^::ffff:/, '');
    const sent = req.headers['x-keel-key'];
    if (ips.includes(ip)) return next();
    if (key && sent && crypto.timingSafeEqual(digest(sent), key)) return next();
    if (req.method === 'GET' && OPEN.includes(req.path)) return next();
    res.status(403).type('text/plain').send('Forbidden: this app only works on the office network.');
  };
}

module.exports = { accessGate };
