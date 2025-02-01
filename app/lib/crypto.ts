import crypto from 'crypto';

// Encryption helpers
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
  // Ensure key is exactly 32 bytes by hashing it
  return crypto.createHash('sha256').update(key).digest();
}

const IV_LENGTH = 16;

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', getEncryptionKey(), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(text: string): string {
  const [ivHex, encryptedHex] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', getEncryptionKey(), iv);
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
} 