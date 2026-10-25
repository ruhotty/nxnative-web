const $ = (id) => document.getElementById(id);
const accessInput = $("access");
const fileInput = $("files");
const fileList = $("file-list");
const startButton = $("start");
let accessCode = "";
let selectedFiles = [];
let currentJob = "";

function formatSize(bytes) {
  if (bytes < 1024 ** 2) return (bytes / 1024) + " KB";
  if (bytes < 1024 ** 3) return (bytes / 1024 ** 2).toFixed(1) + " MB";
  return (bytes / 1024 ** 3).toFixed(2) + " GB";
}
function setStatus(title, message, percent) {
  $("progress-panel").hidden = false;
  $("status-title").textContent = title;
  $("status-text").textContent = message;
  $("progress-bar").style.width = Math.max(0, Math.min(100, percent)) + "%";
}
function api(path, body) {
  return fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": "Bearer " + accessCode },
    body: JSON.stringify(body)
  }).then(async response => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed (" + response.status + ")");
    return data;
  });
}
function renderFiles() {
  fileList.replaceChildren();
  if (!selectedFiles.length) {
    const li = document.createElement("li"); li.className = "empty"; li.textContent = "No files selected."; fileList.append(li);
  }
  for (const file of selectedFiles) {
    const li = document.createElement("li");
    const name = document.createElement("span"); name.textContent = file.name;
    const size = document.createElement("span"); size.className = "file-size"; size.textContent = formatSize(file.size);
    li.append(name, size); fileList.append(li);
  }
  const hasKeys = selectedFiles.some(f => f.name.toLowerCase() === "prod.keys");
  const hasGame = selectedFiles.some(f => /\.(nsp|xci|nsz|xcz)$/i.test(f.name));
  startButton.disabled = !(selectedFiles.length && hasKeys && hasGame && accessCode);
}
$("save-access").addEventListener("click", () => {
  accessCode = accessInput.value.trim();
  renderFiles();
  $("save-access").textContent = accessCode ? "Saved for tab" : "Save";
});
fileInput.addEventListener("change", () => {
  selectedFiles = Array.from(fileInput.files || []);
  renderFiles();
});
function safeName(name) {
  return name.replace(/[^a-zA-Z0-9._ -]/g, "_").replace(/^\.+/, "_").slice(0, 180);
}
async function uploadFile(file, jobId, index, count) {
  const name = safeName(file.name);
  const created = await api("/api/upload/create", {
    jobId, name, size: file.size,
    kind: name.toLowerCase() === "prod.keys" ? "keys" : "game"
  });
  const partSize = created.partSize;
  const parts = [];
  const totalParts = Math.ceil(file.size / partSize);
  for (let part = 1; part <= totalParts; part++) {
    const start = (part - 1) * partSize;
    const chunk = file.slice(start, Math.min(start + partSize, file.size));
    const signed = await api("/api/upload/part-url", {
      jobId, key: created.key, uploadId: created.uploadId, partNumber: part
    });
    const response = await fetch(signed.url, { method: "PUT", body: chunk });
    if (!response.ok) throw new Error("Upload failed for " + name + ", part " + part);
    const etag = response.headers.get("ETag");
    if (!etag) throw new Error("R2 did not return an ETag. Check the bucket CORS exposeHeaders setting.");
    parts.push({ partNumber: part, etag });
    const pct = ((index + (part / totalParts)) / count) * 65;
    setStatus("Uploading files", name + " · part " + part + " of " + totalParts, pct);
  }
  await api("/api/upload/complete", { jobId, key: created.key, uploadId: created.uploadId, parts });
  return { name, key: created.key, size: file.size, kind: created.kind };
}
async function pollStatus(jobId) {
  for (;;) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    const result = await api("/api/status", { jobId });
    const state = result.status || "queued";
    setStatus("Build " + state, result.message || "Checking build status…", state === "succeeded" ? 100 : 75);
    if (result.message) $("logs").textContent = result.message;
    if (state === "succeeded" && result.outputKey) {
      const link = await api("/api/download", { jobId });
      $("download").href = link.url;
      $("download").hidden = false;
      return;
    }
    if (state === "failed") return;
  }
}
startButton.addEventListener("click", async () => {
  if (!accessCode) { setStatus("Access required", "Enter your access code and press Save.", 0); return; }
  startButton.disabled = true;
  $("download").hidden = true;
  $("logs").textContent = "Uploading files securely…";
  currentJob = crypto.randomUUID();
  try {
    const uploaded = [];
    for (let i = 0; i < selectedFiles.length; i++) uploaded.push(await uploadFile(selectedFiles[i], currentJob, i, selectedFiles.length));
    setStatus("Starting build", "Files uploaded. Starting the macOS build…", 68);
    await api("/api/build/start", { jobId: currentJob, files: uploaded });
    await pollStatus(currentJob);
  } catch (error) {
    setStatus("Could not complete", error.message || "Unknown error", 0);
    $("logs").textContent = "Check Cloudflare Pages Function logs and GitHub Actions for details.";
  } finally {
    startButton.disabled = false;
  }
});
