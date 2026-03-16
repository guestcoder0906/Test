export default async function handler(req, res) {
  // Placeholder for server-authoritative maintenance if you later add SERVICE_ROLE auth.
  // Client already performs local low-density respawn checks and expiry cleanup.
  res.status(200).json({ ok: true, message: 'Concept Go! world maintenance endpoint online.' });
}
