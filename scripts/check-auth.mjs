import assert from "node:assert/strict";
import { randomBytes, randomUUID, scryptSync, createHash } from "node:crypto";
import fs from "node:fs";
import ts from "typescript";
const origin = process.env.AUTH_TEST_ORIGIN || "http://127.0.0.1:3000",
  owned = [],
  ownedTasks = [];
async function query(sql, params = []) {
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${process.env.CLOUDFLARE_D1_DATABASE_ID}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
    },
  );
  const data = await r.json();
  if (!r.ok || !data.success) throw Error("QA database request failed");
  return data.result[0].results;
}
function client(cookie = "") {
  return {
    cookie,
    async call(path, method = "GET", body, expected = 200, headers = {}) {
      const r = await fetch(origin + path, {
        method,
        redirect: "manual",
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
          ...(this.cookie ? { Cookie: this.cookie } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const set = r.headers.get("set-cookie");
      if (set) this.cookie = set.split(";")[0];
      assert.equal(
        r.status,
        expected,
        `${method} ${path} returned ${r.status}`,
      );
      return { r, data: await r.json() };
    },
  };
}
const source = ts.transpileModule(
  fs.readFileSync("lib/password-policy.ts", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const { validPassword, roleForEmail } = await import(
  "data:text/javascript;base64," + Buffer.from(source).toString("base64")
);
assert.ok(validPassword("Abcdef1!"));
for (const invalid of [
  "Abcd1!",
  "abcdef1!",
  "ABCDEF1!",
  "Abcdefg!",
  "Abcdef12",
  "Abcde12ก",
])
  assert.ok(!validPassword(invalid));
assert.equal(roleForEmail(" ADMIN@GMAIL.COM "), "admin");
for (const email of [
  "admin+qa@gmail.com",
  "admin@gmail.com.test",
  "xadmin@gmail.com",
])
  assert.equal(roleForEmail(email), "member");
const fixture = ".wrangler/auth-ui-fixture.json";
if (process.argv.includes("--cleanup-ui")) {
  const f = JSON.parse(fs.readFileSync(fixture, "utf8"));
  await query("DELETE FROM auth_recovery WHERE user_id=? OR issued_by=?", [
    f.id,
    f.id,
  ]);
  await query("DELETE FROM auth_sessions WHERE user_id=?", [f.id]);
  await query("DELETE FROM members WHERE user_id=?", [f.id]);
  await query("DELETE FROM auth_users WHERE id=? AND email=?", [f.id, f.email]);
  fs.unlinkSync(fixture);
  console.log("Authentication UI fixture removed.");
  process.exit(0);
}
const tag = randomUUID().slice(0, 8),
  email = `qa-auth-${tag}@example.test`,
  password = "Aa1!" + randomBytes(12).toString("hex"),
  nextPassword = "Bb2@" + randomBytes(12).toString("hex");
const first = client(),
  second = client();
try {
  await first.call("/api/workspace", "GET", undefined, 401);
  await first.call("/api/table-layout", "PUT", {}, 401);
  const page = await fetch(origin + "/tasks", { redirect: "manual" });
  assert.equal(page.status, 307);
  assert.ok(page.headers.get("location").includes("/login"));
  const signup = await first.call(
    "/api/auth/signup",
    "POST",
    { email, password, name: "QA authentication " + tag, role: "admin" },
    201,
  );
  owned.push(signup.data.id);
  assert.equal(signup.data.role, "member");
  assert.ok(signup.data.memberId >= 4);
  const set = signup.r.headers.get("set-cookie");
  assert.match(set, /HttpOnly/i);
  assert.match(set, /SameSite=lax/i);
  assert.match(set, /Max-Age=34560000/);
  assert.ok(!JSON.stringify(signup.data).includes("password_hash"));
  if (process.argv.includes("--prepare-ui")) {
    fs.writeFileSync(
      fixture,
      JSON.stringify({
        id: signup.data.id,
        email,
        password,
        name: "QA authentication " + tag,
      }),
    );
    owned.length = 0;
    console.log("Authentication UI fixture prepared.");
    process.exit(0);
  }
  const originalCookie = first.cookie,
    stored = (
      await query("SELECT password_hash FROM auth_users WHERE id=?", [
        signup.data.id,
      ])
    )[0];
  assert.ok(stored.password_hash.startsWith("scrypt$"));
  assert.ok(!stored.password_hash.includes(password));
  const cols = await query("PRAGMA table_info(auth_sessions)");
  assert.ok(!cols.some((c) => /expir/i.test(c.name)));
  await first.call("/api/auth/users", "GET", undefined, 403);
  await first.call(
    "/api/auth/recovery-code",
    "POST",
    { userId: signup.data.id, code: "Admin-recovery-123" },
    403,
  );
  const workspace = await first.call("/api/workspace");
  assert.ok(workspace.data.members.some((m) => m.id === signup.data.memberId));
  const task = await first.call(
    "/api/tasks",
    "POST",
    {
      name: "QA auth task " + tag,
      assignees: [signup.data.memberId],
      created_by: 0,
    },
    201,
  );
  ownedTasks.push(task.data.id);
  assert.equal(task.data.created_by, signup.data.memberId);
  await first.call("/api/tasks", "POST", { name: "CSRF must fail" }, 403, {
    Origin: "https://evil.example",
  });
  await client("workly_session=" + "00".repeat(32)).call(
    "/api/workspace",
    "GET",
    undefined,
    401,
  );
  await second.call(
    "/api/auth/login",
    "POST",
    { email, password: "wrong-password" },
    401,
  );
  await second.call("/api/auth/login", "POST", { email, password });
  const secondOldCookie = second.cookie;
  const code = "Recovery-" + randomBytes(18).toString("hex"),
    salt = randomBytes(16).toString("hex"),
    codeHash =
      "scrypt$" +
      salt +
      "$" +
      scryptSync(code, salt, 64, {
        N: 32768,
        r: 8,
        p: 3,
        maxmem: 64 * 1024 * 1024,
      }).toString("hex");
  await query(
    "INSERT INTO auth_recovery(user_id,code_hash,issued_by,created_at) VALUES(?,?,?,?)",
    [signup.data.id, codeHash, signup.data.id, Date.now()],
  );
  await client().call(
    "/api/auth/reset-password",
    "POST",
    { email, password: nextPassword, code: "wrong-recovery-code" },
    400,
  );
  await client().call("/api/auth/reset-password", "POST", {
    email,
    password: nextPassword,
    code,
  });
  await client().call(
    "/api/auth/reset-password",
    "POST",
    { email, password: nextPassword, code },
    400,
  );
  await client(originalCookie).call("/api/workspace", "GET", undefined, 401);
  await client(secondOldCookie).call("/api/workspace", "GET", undefined, 401);
  await client().call("/api/auth/login", "POST", { email, password }, 401);
  await first.call("/api/auth/login", "POST", {
    email,
    password: nextPassword,
  });
  await first.call("/api/tasks", "DELETE", { id: ownedTasks.pop() });
  const validCookie = first.cookie;
  await first.call("/api/auth/logout", "POST");
  await client(validCookie).call("/api/workspace", "GET", undefined, 401);
  const sessions = await query(
    "SELECT token_hash FROM auth_sessions WHERE user_id=?",
    [signup.data.id],
  );
  assert.equal(sessions.length, 0);
  console.log(
    "PASS: password rules, nominated admin policy, signup, persistent HttpOnly cookie, protected pages/APIs, dynamic assignees, CSRF rejection, reset code single-use, all-session revocation, login and logout.",
  );
} finally {
  for (const id of ownedTasks)
    await query("DELETE FROM tasks WHERE id=?", [id]);
  for (const id of owned) {
    await query("DELETE FROM auth_recovery WHERE user_id=? OR issued_by=?", [
      id,
      id,
    ]);
    await query("DELETE FROM auth_sessions WHERE user_id=?", [id]);
    await query("DELETE FROM members WHERE user_id=?", [id]);
    await query("DELETE FROM auth_users WHERE id=?", [id]);
  }
  for (const action of ["signup", "login", "reset-password"])
    await query("DELETE FROM auth_rate_limits WHERE key=?", [
      createHash("sha256")
        .update(action + ":email:" + email)
        .digest("hex"),
    ]);
  if (owned.length) console.log("Authentication test accounts removed.");
}
