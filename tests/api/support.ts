export interface ApiTestConfig {
  baseUrl: string;
  memberCookie: string;
  adminCookie: string;
  mutationDate: string;
  missing: string[];
}

const readEnv = (...names: string[]): string =>
  names.map((name) => process.env[name]?.trim()).find(Boolean) ?? "";

export const apiTestConfig: ApiTestConfig = {
  baseUrl: readEnv("W8_API_BASE_URL"),
  memberCookie: readEnv("W8_API_MEMBER_A_COOKIE"),
  adminCookie: readEnv("W8_API_ADMIN_COOKIE"),
  mutationDate: readEnv("W8_API_TEST_LOCAL_DATE"),
  missing: [],
};

apiTestConfig.missing = [
  !apiTestConfig.baseUrl ? "W8_API_BASE_URL" : "",
  !apiTestConfig.memberCookie ? "W8_API_MEMBER_A_COOKIE" : "",
  !apiTestConfig.adminCookie ? "W8_API_ADMIN_COOKIE" : "",
].filter(Boolean);

export const apiConfigurationMessage =
  apiTestConfig.missing.length === 0
    ? ""
    : `[W8 API] Real request-contract tests skipped. Configure ${apiTestConfig.missing.join(
        ", ",
      )}. The suite does not substitute mocked routes or placeholder Supabase credentials.`;

if (apiConfigurationMessage) {
  console.warn(apiConfigurationMessage);
}

export const PRIVATE_RESPONSE_TOKENS = [
  "access_token",
  "refresh_token",
  "service_role",
  "serviceRole",
  "code_digest",
  "code_ciphertext",
  "rawEvents",
  "rawDayEvents",
  "dayDeltas",
  "optionalGoalLogs",
  "privatePhotoPath",
] as const;

export function assertNoPrivateResponseFields(value: unknown): void {
  const serialized =
    typeof value === "string" ? value : (JSON.stringify(value) ?? "");

  for (const token of PRIVATE_RESPONSE_TOKENS) {
    if (serialized.includes(token)) {
      throw new Error(`[W8 API] Private response field leaked: ${token}`);
    }
  }
}

export async function apiRequest(
  path: string,
  init: RequestInit = {},
  cookie = "",
): Promise<Response> {
  if (!apiTestConfig.baseUrl) {
    throw new Error(
      "[W8 API] W8_API_BASE_URL is required for real request-contract tests.",
    );
  }

  const headers = new Headers(init.headers);
  if (cookie) {
    headers.set("cookie", cookie);
  }

  return fetch(new URL(path, apiTestConfig.baseUrl), {
    ...init,
    headers,
  });
}

export function jsonRequestBody(body: unknown): {
  body: string;
  headers: Headers;
} {
  return {
    body: JSON.stringify(body),
    headers: new Headers({ "content-type": "application/json" }),
  };
}

export async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
