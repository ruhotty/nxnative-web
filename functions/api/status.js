import { json, requireAuth, readJson, validJobId, s3Request, configMissing } from "../_lib.js";

export async function onRequestPost({ request, env }) {
  const denied = requireAuth(request, env); if (denied) return denied;
  if (configMissing(env)) return json({ error: "Storage is not configured." }, 503);
  const body = await readJson(request);
  if (!body || !validJobId(body.jobId)) return json({ error: "Invalid job ID." }, 400);
  const response = await s3Request(env, "jobs/" + body.jobId + "/status.json");
  if (response.status === 404) return json({ status: "queued", message: "Waiting for the build runner." });
  if (!response.ok) return json({ error: "Could not read build status." }, 502);
  return json(await response.json());
}