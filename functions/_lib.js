import { AwsClient } from "aws4fetch";

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
export function requireAuth(request, env) {
  const header = request.headers.get("authorization") || "";
  if (!env.NX_WEB_TOKEN || header !== "Bearer " + env.NX_WEB_TOKEN) {
    return json({ error: "Invalid access code." }, 401);
  }
  return null;
}
export async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}
export function validJobId(id) {
  return typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id);
}
export function safeFilename(name) {
  return typeof name === "string" && name.length <= 180 && /^[a-zA-Z0-9._ -]+$/.test(name) && !name.startsWith(".");
}
export function s3Url(env, key, query = "") {
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  return new URL("https://" + env.R2_ACCOUNT_ID + ".r2.cloudflarestorage.com/" + env.R2_BUCKET + "/" + encoded + query);
}
export function s3Client(env) {
  return new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: "s3",
    region: "auto"
  });
}
export async function s3Request(env, key, init = {}, query = "") {
  const response = await s3Client(env).fetch(s3Url(env, key, query), init);
  return response;
}
export async function putJson(env, key, value) {
  const response = await s3Request(env, key, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value)
  });
  if (!response.ok) throw new Error("Could not save job metadata to R2.");
}
export async function signedUrl(env, key, method = "GET", query = "", expires = 3600) {
  const url = s3Url(env, key, query);
  return s3Client(env).sign(url, { method, aws: { signQuery: true, expires } }).then(r => r.url);
}
export function configMissing(env) {
  return ["NX_WEB_TOKEN","R2_ACCOUNT_ID","R2_BUCKET","R2_ACCESS_KEY_ID","R2_SECRET_ACCESS_KEY"].some(k => !env[k]);
}