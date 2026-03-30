import { createHash } from "node:crypto";

function deriveCredentialSecret(): string | null {
  if (process.env.OPTIO_CREDENTIAL_SECRET) return process.env.OPTIO_CREDENTIAL_SECRET;
  if (process.env.OPTIO_ENCRYPTION_KEY) {
    // Derive a separate secret — never expose the raw encryption key to pods.
    // Must match the Helm template: sha256sum of "{key}:credential-secret"
    return createHash("sha256")
      .update(`${process.env.OPTIO_ENCRYPTION_KEY}:credential-secret`)
      .digest("hex");
  }
  return null;
}

// Lazy-initialized credential secret. Computed on first access so that:
// 1. Local dev without GitHub App doesn't crash on module load
// 2. Test module loading order doesn't matter
let credentialSecret: string | null | undefined;

function getOrDeriveCredentialSecret(): string | null {
  if (credentialSecret === undefined) {
    credentialSecret = deriveCredentialSecret();
  }
  return credentialSecret;
}

export function getCredentialSecret(): string {
  const secret = getOrDeriveCredentialSecret();
  if (!secret) {
    throw new Error(
      "OPTIO_CREDENTIAL_SECRET or OPTIO_ENCRYPTION_KEY required for credential endpoint",
    );
  }
  return secret;
}

/** Re-derive the credential secret from current env vars. For testing only. */
export function resetCredentialSecret(): void {
  credentialSecret = undefined;
}

/** Get the credential secret if available, or null. Used by route handlers. */
export { getOrDeriveCredentialSecret };
