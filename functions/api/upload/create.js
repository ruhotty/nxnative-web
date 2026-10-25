import { json, requireAuth, readJson, validJobId, safeFilename, s3Request, configMissing } from "../../_lib.js";

export async function onRequestPost({ request, env }) {
  const denied = requireAuth(request, env); if (denied) return denied;
  if (configMissing(env)) return json({ error: "The site owner has not configured R2 and the access code yet." }, 503);
  const body = await readJson(request);
  if (!body || !validJobId(body.jobId) || !safeFilename(body.name) || !Number.isSafeInteger(body.size) || body.size < 1) return json({ error: "Invalid file details." }, 400);
  const name = body.name;
  const kind = name.toLowerCase() === "prod.keys" ? "keys" : "game";
  if (kind === "game" && !/\.(nsp|xci|nsz|xcz)$/i.test(name)) return json({ error: "Only NSP, XCI, NSZ, XCZ and prod.keys files are accepted." }, 400);
  if (kind === "keys" && name !== "prod.keys") return json({ error: "The key file must be named prod.keys." }, 400);
  const key = "jobs/" + body.jobId + "/input/" + name;
  const response = await s3Request(env, key, { method: "POST" }, "?uploads");
  if (!response.ok) return json({ error: "R2 could not start the multipart upload." }, 502);
  const xml = await response.text();
  const match = xml.match(/<UploadId>([^<]+)<\/UploadId>/);
  if (!match) return json({ error: "R2 did not return an upload ID." }, 502);
  return json({ key, uploadId: match[1], kind, partSize: 64 * 1024 * 1024 });
}