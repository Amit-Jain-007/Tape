// Access check disabled: every /api/* function is open to anyone with the URL.
module.exports = function requireAccess(req, res) {
  // Private data must never be stored by a CDN or shared proxy.
  res.setHeader('Cache-Control', 'no-store');
  return true;
};
