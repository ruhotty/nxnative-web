import { json, requireAuth, readJson, validJobId, safeFilename, s3Request, putJson, configMissing } from "../../_lib.js";

export async function onRequestPost({ request, env }) {
  const denied = requireAuth(request, env); if (denied) return denied;
  if (configMissing(env) || !env.GITHUB_TOKEN) return json({ error: "The site owner has not configured R2, the access code and GitHub Actions token." }, 503);
  const body = await readJson(request);
  if (!body || !validJobId(body.jobId) || !Array.isArray(body.files) || body.files.length < 2 || body.files.length > 100) return json({ error: "Invalid build request." }, 400);
  let hasKeys = false, hasGame = false;
  const files = [];
  for (const file of body.files) {
    if (!file || !safeFilename(file.name) || typeof file.key !== "string" || file.key !== "jobs/" + body.jobId + "/input/" + file.name || !Number.isSafeInteger(file.size) || file.size < 1) return json({ error: "Invalid file manifest." }, 400);
    if (file.kind === "keys" && file.name === "prod.keys") hasKeys = true;
    if (file.kind === "game" && /\.(nsp|xci|nsz|xcz)$/i.test(file.name)) hasGame = true;
    const head = await s3Request(env, file.key, { method: "HEAD" });
    if (!head.ok) return json({ error: "An uploaded file is missing from storage." }, 400);
    files.push({ name: file.name, key: file.key, size: file.size, kind: file.kind });
  }
  if (!hasKeys || !hasGame) return json({ error: "Upload prod.keys and at least one game file." }, 400);
  const manifestKey = "jobs/" + body.jobId + "/manifest.json";
  await putJson(env, manifestKey, { jobId: body.jobId, files, createdAt: new Date().toISOString() });
  await putJson(env, "jobs/" + body.jobId + "/status.json", { status: "queued", message: "Build queued.", updatedAt: new Date().toISOString() });
  const response = await fetch("https://api.github.com/repos/" + env.GITHUB_REPOSITORY + "/actions/workflows/nxnative-web-build.yml/dispatches", {
    method: "POST",
    headers: { "authorization": "Bearer " + env.GITHUB_TOKEN, "accept": "application/vnd.github+json", "content-type": "application/json", "x-github-api-version": "2022-11-28", "user-agent": "NXNative-Web" },
    body: JSON.stringify({ ref: env.NX_GITHUB_REF || "main", inputs: { job_id: body.jobId, manifest_key: manifestKey } })
  });
  if (!response.ok) {
    await putJson(env, "jobs/" + body.jobId + "/status.json", { status: "failed", message: "GitHub Actions rejected the build request. Check the workflow ref and token permissions.", updatedAt: new Date().toISOString() });
    return json({ error: "GitHub Actions rejected the build request. Check the setup guide." }, 502);
  }
  return json({ ok: true, jobId: body.jobId });
}