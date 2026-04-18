import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();

vi.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: vi
    .fn()
    .mockImplementation(function SecretsManagerClient() {
      this.send = sendMock;
    }),
  GetSecretValueCommand: vi
    .fn()
    .mockImplementation(function GetSecretValueCommand(input) {
      this.input = input;
    }),
}));

describe("loadSecrets", () => {
  beforeEach(() => {
    vi.resetModules();
    sendMock.mockReset();
    delete process.env.AWS_REGION;
    delete process.env.SECRETS_ID;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to eu-west-1 when loading secrets", async () => {
    sendMock.mockResolvedValue({
      SecretString: JSON.stringify({ LLM_API_KEY: "test-key" }),
    });
    process.env.SECRETS_ID = "oghmanotes/app-secrets";

    const { loadSecrets } = await import("@/lib/secrets");
    await loadSecrets();

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        input: { SecretId: "oghmanotes/app-secrets" },
      }),
    );
  });
});
