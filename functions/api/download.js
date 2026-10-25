import { json, requireAuth, readJson, validJobId, s3Request, signedUrl, configMissing } from "../_lib.js";

export async function onRequestPost({ request, env }) {
  const denied = requireAuth(request, env); if (denied) return denied;
  if (configMissing(env)) return json({ error: "Storage is not configured." }, 503);
  const body = await readJson(request);
  if (!body || !validJobId(body.jobId)) return json({ error: "Invalid job ID." }, 400);
  const response = await s3Request(env, "jobs/" + body.jobId + "/status.json");
  if (!response.ok) return json({ error: "Build status not found." }, 404);
  const status = await response.json();
  if (status.status !== "succeeded" || typeof status.outputKey !== "string" || !status.outputKey.startsWith("jobs/" + body.jobId + "/output/")) return json({ error: "The IPA is not ready." }, 409);
  return json({ url: await signedUrl(env, status.outputKey, "GET", "", 3600) });
}