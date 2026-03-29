import { api } from "./api-client";
import type { TokenProvider } from "./ws-client";

const AUTH_DISABLED = process.env.OPTIO_AUTH_DISABLED === "true";

/** Returns a TokenProvider that fetches short-lived WS tokens from the API. */
export function getWsTokenProvider(): TokenProvider | undefined {
  if (AUTH_DISABLED) return undefined;

  return async () => {
    try {
      const { token } = await api.getWsToken();
      return token;
    } catch {
      return null;
    }
  };
}
