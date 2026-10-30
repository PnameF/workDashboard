import fs from "node:fs";
export async function installTestSession() {
  const fixture = fs.existsSync(".wrangler/auth-ui-fixture.json")
    ? JSON.parse(fs.readFileSync(".wrangler/auth-ui-fixture.json", "utf8"))
    : {};
  const email = process.env.AUTH_TEST_EMAIL || fixture.email,
    password = process.env.AUTH_TEST_PASSWORD || fixture.password;
  if (!email || !password)
    throw Error(
      "Prepare a disposable account first: node --env-file=.env scripts/check-auth.mjs --prepare-ui",
    );
  const base = process.env.AUTH_TEST_ORIGIN || "http://127.0.0.1:3000",
    nativeFetch = globalThis.fetch;
  const response = await nativeFetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw Error("Test account login failed");
  const user = await response.json(),
    cookie = response.headers.get("set-cookie").split(";")[0],
    port = new URL(base).port;
  globalThis.fetch = (input, init) => {
    const url = new URL(
      typeof input === "string" || input instanceof URL ? input : input.url,
    );
    if (
      ["localhost", "127.0.0.1"].includes(url.hostname) &&
      url.port === port
    ) {
      const headers = new Headers(init?.headers);
      headers.set("Cookie", cookie);
      if (!headers.has("Origin")) headers.set("Origin", url.origin);
      return nativeFetch(input, { ...init, headers });
    }
    return nativeFetch(input, init);
  };
  return user;
}
