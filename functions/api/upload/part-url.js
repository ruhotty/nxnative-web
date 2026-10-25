import { json, requireAuth, readJson, validJobId, signedUrl, configMissing } from "../../_lib.js";

export async function onRequestPost({ request, env }) {
  const denied = requireAuth(request, env); if (denied) return denied;
  if (configMissing(env)) return json({ error: "Storage is not configured." }, 503);
  const body = await readJson(request);
  if (!body || !validJobId(body.jobId) || typeof body.key !== "string" || !body.key.startsWith("jobs/" + body.jobId + "/input/") || typeof body.uploadId !== "string" || !Number.isInteger(body.partNumber) || body.partNumber < 1 || body.partNumber > 10000) return json({ error: "Invalid multipart upload details." }, 400);
  const url = await signedUrl(env, body.key, "PUT", "?partNumber=" + body.partNumber + "&uploadId=" + encodeURIComponent(body.uploadId), 3600);
  return json({ url });
}