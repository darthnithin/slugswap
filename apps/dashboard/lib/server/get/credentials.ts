import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

function getSecretKey(): Buffer {
  const secret = process.env.GET_CREDENTIAL_SECRET;
  if (!secret) {
    throw new Error("GET_CREDENTIAL_SECRET is not set");
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(value: string): string {
  const key = getSecretKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  const [ivBase64, tagBase64, dataBase64] = payload.split(":");
  if (!ivBase64 || !tagBase64 || !dataBase64) {
    throw new Error("Invalid encrypted secret format");
  }

  const key = getSecretKey();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivBase64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagBase64, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataBase64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
