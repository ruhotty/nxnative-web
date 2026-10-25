# NXNative Web setup

This keeps the upstream NXNative scripts and adds a Cloudflare Pages upload interface. It is a private-use tool, not a public upload service. Do not upload games or keys you do not have the right to use.

## Architecture

- Cloudflare Pages serves the static interface in `web/`.
- Pages Functions under `functions/api/` create R2 multipart uploads and dispatch a GitHub Actions workflow.
- Game files and `prod.keys` go directly from the browser to a private Cloudflare R2 bucket using short-lived signed part URLs.
- GitHub Actions on macOS downloads the files, runs the existing `scripts/build_ipa_from_nsp.py`, then uploads the IPA to R2.
- Download links expire after one hour.

GitHub-hosted macOS runners have limited free disk space. NXNative documents that builds need free disk space of about twice the NSP size plus 10 GB. Many games will not fit on a standard runner. This setup does not promise that large games will build on the free runner.

## 1. Create a private R2 bucket

In the Cloudflare dashboard, open R2 Object Storage and create a bucket, for example `nxnative-web-private`. Keep public access disabled.

Create an R2 API token with Object Read & Write access only to this bucket. Save its access key ID and secret access key.

Set bucket CORS to allow browser multipart uploads from your Pages site. Replace `https://YOUR-PROJECT.pages.dev` with your actual Pages hostname:

```json
[
  {
    "AllowedOrigins": ["https://YOUR-PROJECT.pages.dev"],
    "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Use a bucket lifecycle rule to delete objects under `jobs/` after 1 day. Successful IPAs and source files otherwise consume R2 storage.

## 2. Add GitHub Actions secrets

In GitHub, open Settings, Secrets and variables, Actions, New repository secret. Add:

- `R2_ACCOUNT_ID`, your Cloudflare account ID.
- `R2_BUCKET`, the bucket name.
- `R2_ACCESS_KEY_ID`, the R2 access key ID.
- `R2_SECRET_ACCESS_KEY`, the R2 secret access key.

The workflow needs these secrets to download inputs and upload the output. Do not put any of these values in files committed to Git.

## 3. Deploy to Cloudflare Pages

Create a Pages project connected to `ruhotty/nxnative-web`. Configure:

- Production branch: `main`.
- Build command: `npm install`.
- Build output directory: `web`.
- Root directory: repository root.

The `functions/` directory must remain at the repository root so Pages can deploy the API routes.

In Pages, open Settings, Variables and Secrets and add these runtime variables/secrets:

- `R2_ACCOUNT_ID`, account ID.
- `R2_BUCKET`, bucket name.
- `R2_ACCESS_KEY_ID`, R2 access key ID.
- `R2_SECRET_ACCESS_KEY`, R2 secret access key.
- `NX_WEB_TOKEN`, a long random access code. Keep it private.
- `GITHUB_TOKEN`, a fine-grained GitHub token restricted to this repository with Actions read/write permission.
- `GITHUB_REPOSITORY`, set to `ruhotty/nxnative-web`.
- `NX_GITHUB_REF`, set to `main`.

Set these as encrypted secrets where supported. Redeploy after adding them. Never use a public token in frontend JavaScript.

## 4. Merge the web branch

Open a pull request from `feature/nxnative-web` to `main`, review the files, then merge it. The workflow dispatch endpoint needs the workflow to exist on the target ref, so deploy only after the workflow is on `main`.

## 5. Enable Actions

In GitHub, open Actions and ensure workflows are enabled. Open the `NXNative Web build` workflow. The web app dispatches it with a job ID and manifest key. The access token is only used in the Pages Function, never in the browser code.

## 6. Use the website

Open your Pages hostname, enter the value of `NX_WEB_TOKEN`, and click Save. Select one or more `.nsp`, `.xci`, `.nsz`, or `.xcz` files and a file named exactly `prod.keys`. Click Upload and build. The browser uploads in 64 MiB chunks. When the workflow finishes, the page offers a temporary IPA download link.

## Security and limitations

- Do not make the R2 bucket public.
- Do not share the access code. Anyone with it can start builds and use your storage.
- Do not print key contents or add keys to GitHub artifacts.
- Set a one-day lifecycle cleanup rule for `jobs/` objects.
- Review GitHub Actions usage limits and billing before using this for large games.
- The first build installs large dependencies and can take a long time.
- Test with a small game file you own before trying a large game.
- This is an initial implementation. Validate the Pages Functions and multipart R2 flow with a small test upload before trusting it with valuable files.
