// Shared access check for every /api/* function.
//
// The page sends your access key in an `x-tape-key` header; the server
// compares it with the TAPE_ACCESS_KEY environment variable you set in
// Vercel. Without the right key, no trade data or balance is returned.

const crypto = require('crypto');

const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();

module.exports = function requireAccess(req, res) {
  // Private data must never be stored by a CDN or shared proxy.
  res.setHeader('Cache-Control', 'no-store');

  const expected = (process.env.TAPE_ACCESS_KEY || '').trim();
  if (!expected) {
    res.status(500).json({
      error:
        'TAPE_ACCESS_KEY is not set on the server. Add it in Vercel → Settings → Environment Variables, then redeploy.',
    });
    return false;
  }
  // There is no rate limiting here, so refuse weak keys outright.
  if (expected.length < 12) {
    res.status(500).json({
      error: 'TAPE_ACCESS_KEY is too short. Use at least 12 characters (a long passphrase is best).',
    });
    return false;
  }

  const given = String(req.headers['x-tape-key'] || '').trim();
  // Hash both sides first: the comparison is then constant-time and length-safe.
  if (!crypto.timingSafeEqual(digest(given), digest(expected))) {
    res.status(401).json({ error: 'Wrong or missing access key.' });
    return false;
  }
  return true;
};
