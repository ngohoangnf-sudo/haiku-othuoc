const { createHash, randomBytes, scryptSync, timingSafeEqual } = require("crypto");

const PASSWORD_SALT_BYTES = 16;
const PASSWORD_KEY_LENGTH = 64;
const SESSION_TOKEN_BYTES = 32;

function hashPassword(password) {
  const normalized = String(password || "");
  const salt = randomBytes(PASSWORD_SALT_BYTES).toString("hex");
  const hash = scryptSync(normalized, salt, PASSWORD_KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(":")) {
    return false;
  }

  const [salt, expectedHash] = storedHash.split(":");
  if (!salt || !expectedHash) {
    return false;
  }

  const candidateHash = scryptSync(String(password || ""), salt, PASSWORD_KEY_LENGTH).toString("hex");

  try {
    return timingSafeEqual(Buffer.from(candidateHash, "hex"), Buffer.from(expectedHash, "hex"));
  } catch (_error) {
    return false;
  }
}

function generateSessionToken() {
  return randomBytes(SESSION_TOKEN_BYTES).toString("hex");
}

function hashSessionToken(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hashSessionToken,
};
