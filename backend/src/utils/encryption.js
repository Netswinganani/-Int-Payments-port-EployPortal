// src/utils/encryption.js
const crypto = require('crypto');

const SECRET_KEY = Buffer.from(process.env.ENCRYPTION_SECRET_KEY, 'hex');
const IV = Buffer.from(process.env.IV, 'hex');

const encryptData = (data) => {
  const cipher = crypto.createCipheriv('aes-256-cbc', SECRET_KEY, IV);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
};

const decryptData = (encryptedData) => {
  const decipher = crypto.createDecipheriv('aes-256-cbc', SECRET_KEY, IV);
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

module.exports = {
  encryptData,
  decryptData
};
