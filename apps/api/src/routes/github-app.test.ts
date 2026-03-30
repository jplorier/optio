import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

// ─── Mocks ───

const mockGetGitHubToken = vi.fn();
vi.mock("../services/github-token-service.js", () => ({
  getGitHubToken: (...args: unknown[]) => mockGetGitHubToken(...args),
}));

const mockIsGitHubAppConfigured = vi.fn();
vi.mock("../services/github-app-service.js", () => ({
  isGitHubAppConfigured: (...args: unknown[]) => mockIsGitHubAppConfigured(...args),
}));

import githubAppRoutes from "./github-app.js";
import {
  getCredentialSecret,
  resetCredentialSecret,
} from "../services/credential-secret-service.js";

// ─── Helpers ───

// Ensure the credential secret is derived from a known key, regardless of
// module load order in the test suite.
process.env.OPTIO_ENCRYPTION_KEY = "test-encryption-key-for-unit-tests";
resetCredentialSecret();
const VALID_BEARER = `Bearer ${getCredentialSecret()}`;

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await githubAppRoutes(app);
  await app.ready();
  return app;
}

// ─── Tests ───

describe("GET /api/internal/git-credentials", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildTestApp();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 401 when no Authorization header", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/internal/git-credentials",
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("Unauthorized");
  });

  it("returns 401 when incorrect bearer token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/internal/git-credentials",
      headers: { authorization: "Bearer wrong-token" },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("Unauthorized");
  });

  it("returns token with valid bearer and taskId query param", async () => {
    mockGetGitHubToken.mockResolvedValue("ghp_task_token");

    const res = await app.inject({
      method: "GET",
      url: "/api/internal/git-credentials?taskId=task-123",
      headers: { authorization: VALID_BEARER },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ token: "ghp_task_token" });
    expect(mockGetGitHubToken).toHaveBeenCalledWith({ taskId: "task-123" });
  });

  it("returns token with valid bearer and no taskId", async () => {
    mockGetGitHubToken.mockResolvedValue("ghp_server_token");

    const res = await app.inject({
      method: "GET",
      url: "/api/internal/git-credentials",
      headers: { authorization: VALID_BEARER },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ token: "ghp_server_token" });
    expect(mockGetGitHubToken).toHaveBeenCalledWith({ server: true });
  });

  it("returns 500 when token service throws", async () => {
    mockGetGitHubToken.mockRejectedValue(new Error("Token fetch failed"));

    const res = await app.inject({
      method: "GET",
      url: "/api/internal/git-credentials",
      headers: { authorization: VALID_BEARER },
    });

    expect(res.statusCode).toBe(500);
    expect(res.json().error).toBe("Failed to retrieve git credentials");
  });
});

describe("GET /api/github-app/status", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildTestApp();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns configured status when GitHub App is configured", async () => {
    mockIsGitHubAppConfigured.mockReturnValue(true);
    process.env.GITHUB_APP_ID = "12345";
    process.env.GITHUB_APP_INSTALLATION_ID = "67890";

    const res = await app.inject({
      method: "GET",
      url: "/api/github-app/status",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      configured: true,
      appId: "12345",
      installationId: "67890",
    });

    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_INSTALLATION_ID;
  });

  it("returns not configured when GitHub App is not configured", async () => {
    mockIsGitHubAppConfigured.mockReturnValue(false);

    const res = await app.inject({
      method: "GET",
      url: "/api/github-app/status",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ configured: false });
  });
});
