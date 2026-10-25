import { json, requireAuth, readJson, validJobId, s3Request, configMissing } from "../../_lib.js";

function xmlEscape(value) { return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }
export async function onRequestPost({ request, env }) {
  const denied = requireAuth(request, env); if (denied) return denied;
  if (configMissing(env)) return json({ error: "Storage is not configured." }, 503);
  const body = await readJson(request);
  if (!body || !validJobId(body.jobId) || typeof body.key !== "string" || !body.key.startsWith("jobs/" + body.jobId + "/input/") || typeof body.uploadId !== "string" || !Array.isArray(body.parts) || !body.parts.length || body.parts.length > 10000) return json({ error: "Invalid multipart completion details." }, 400);
  const parts = [...body.parts].sort((a,b) => a.partNumber - b.partNumber);
  if (parts.some((p,i) => p.partNumber !== i + 1 || typeof p.etag !== "string" || p.etag.length > 200)) return json({ error: "Invalid multipart part list." }, 400);
  const xml = "<CompleteMultipartUpload>" + parts.map(p => "<Part><PartNumber>" + p.partNumber + "</PartNumber><ETag>" + xmlEscape(p.etag) + "</ETag></Part>").join("") + "</CompleteMultipartUpload>";
  const response = await s3Request(env, body.key, { method: "POST", headers: { "content-type": "application/xml" }, body: xml }, "?uploadId=" + encodeURIComponent(body.uploadId));
  if (!response.ok) return json({ error: "R2 could not complete the upload." }, 502);
  return json({ ok: true });
}