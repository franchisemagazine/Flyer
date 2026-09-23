import { readdir, readFile, mkdir, writeFile, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PROJECT = Object.freeze({
  id: 'prj_AKZVAle2oXZCbKoG4AvEXtUNvw6f',
  name: 'flyers',
  teamId: 'team_t31Tz6406znGjsh9AS6Lxpw9',
});
export const PRODUCTION_ALIAS = 'pcswireless.vercel.app';
const ROOT = new URL('../', import.meta.url);
const SOURCE_FOLDERS = ['public', 'api', 'lib', 'scripts', 'test', 'data'];
const ROOT_FILES = ['package.json', 'package-lock.json', 'vercel.json'];
const TEXT_EXTENSIONS = /\.(?:js|mjs|json|html|css|svg|txt)$/;
const BINARY_EXTENSIONS = /\.(?:png|jpe?g|webp)$/;

// Explicit source allowlist: never upload credentials, local Vercel state,
// dependencies, generated builds, ZIPs, or arbitrary root-level files.
export async function sourceFiles(root = ROOT) {
  const paths = [...ROOT_FILES];
  async function visit(folder) {
    const entries = await readdir(new URL(folder + '/', root), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const path = `${folder}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error(`Refusing source symlink: ${path}`);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && (TEXT_EXTENSIONS.test(entry.name) || BINARY_EXTENSIONS.test(entry.name))) paths.push(path);
    }
  }
  for (const folder of SOURCE_FOLDERS) await visit(folder);
  const files = [];
  for (const file of paths.sort()) {
    const location = new URL(file, root);
    if ((await lstat(location)).isSymbolicLink()) throw new Error(`Refusing source symlink: ${file}`);
    const bytes=await readFile(location);
    if(BINARY_EXTENSIONS.test(file))files.push({file,data:bytes.toString('base64'),encoding:'base64'});
    else files.push({file,data:bytes.toString('utf8'),encoding:'utf-8'});
  }
  return files;
}

export function deploymentPayload(files) {
  const sourceHash = createHash('sha256').update(JSON.stringify(files)).digest('hex');
  return {
    name: PROJECT.name,
    project: PROJECT.id,
    target: 'production',
    files,
    projectSettings: { framework: null, buildCommand: 'npm run check', outputDirectory: 'dist', nodeVersion: '24.x' },
    meta: { flyersSourceHash: sourceHash, flyersVersion: '2.0.0' },
  };
}

export function apiClient(token, fetchImpl = fetch, { accountScoped = false } = {}) {
  if (!token?.trim()) throw new Error('VERCEL_TOKEN is not configured. Supply it through your execution environment; never put it in source files or chat.');
  return async function request(path, { method = 'GET', body, forceNew = false } = {}) {
    if (!path.startsWith('/v') || path.includes('://') || path.includes('?') || path.includes('#')) throw new Error('Invalid Vercel API path.');
    const url = new URL(path, 'https://api.vercel.com');
    if (url.origin !== 'https://api.vercel.com') throw new Error('Invalid Vercel API origin.');
    // Team/project-scoped tokens infer their scope. Full-account tokens need
    // an explicit team, and must opt into that mode in the local environment.
    if (accountScoped) url.searchParams.set('teamId', PROJECT.teamId);
    if (forceNew) url.searchParams.set('forceNew', '1');
    const response = await fetchImpl(url, {
      method,
      redirect: 'error',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(120_000),
    });
    let data;
    try { data = await response.json(); } catch { throw new Error(`Vercel returned a non-JSON response (HTTP ${response.status}).`); }
    if (!response.ok) {
      const code = String(data?.error?.code || 'request_failed').replace(/[^a-z0-9_-]/gi, '').slice(0,100);
      throw new Error(`Vercel API failed: HTTP ${response.status} (${code}).`);
    }
    return data;
  };
}

export async function verifyProject(request) {
  const project = await request(`/v9/projects/${PROJECT.id}`);
  if (project.id !== PROJECT.id || project.name !== PROJECT.name || project.accountId !== PROJECT.teamId) {
    throw new Error('Project identity mismatch. Refusing to create a deployment.');
  }
  return project;
}

export async function ensureProductionIsPublic(request) {
  await request(`/v9/projects/${PROJECT.id}`,{
    method:'PATCH',
    body:{ssoProtection:{deploymentType:'preview'}},
  });
  const project=await request(`/v9/projects/${PROJECT.id}`);
  const protection=project.ssoProtection;
  if(protection && protection.deploymentType!=='preview'){
    throw new Error('Production Vercel Authentication is still enabled. Refusing to report the site as public.');
  }
  return project;
}

export async function assignProductionAlias(request, deploymentId) {
  if(!/^dpl_[A-Za-z0-9]+$/.test(deploymentId||''))throw new Error('Invalid deployment ID for alias assignment.');
  const result=await request(`/v2/deployments/${deploymentId}/aliases`,{method:'POST',body:{alias:PRODUCTION_ALIAS,redirect:null}});
  if(result.alias!==PRODUCTION_ALIAS)throw new Error('Vercel did not confirm the requested production alias.');
  return result;
}

export async function createDeployment(request, files) {
  await verifyProject(request);
  const result = await request('/v13/deployments', { method: 'POST', forceNew: true, body: deploymentPayload(files) });
  if (!/^dpl_[A-Za-z0-9]+$/.test(result.id || '')) throw new Error('Vercel did not return a deployment ID. Inspect the project before retrying.');
  return result;
}

async function saveReceipt(result, extra = {}) {
  const receipt = { project: PROJECT, deploymentId: result.id, url: result.url || null, state: result.readyState || result.status || null, checkedAt: new Date().toISOString(), ...extra };
  await mkdir(new URL('.vercel/', ROOT), { recursive: true });
  await writeFile(new URL('.vercel/api-deployment-receipt.json', ROOT), JSON.stringify(receipt, null, 2) + '\n');
  return receipt;
}

async function watch(request, id) {
  const deadline = Date.now() + 15 * 60_000;
  let previousState;
  while (Date.now() < deadline) {
    const deployment = await request(`/v13/deployments/${id}`);
    if (deployment.projectId !== PROJECT.id) throw new Error('Deployment belongs to a different project.');
    const state = deployment.readyState || deployment.status;
    if (state !== previousState) { console.log(`Deployment ${id}: ${state}`); previousState = state; }
    await saveReceipt(deployment);
    if (state === 'READY') {
      console.log(JSON.stringify({ deploymentId: id, project: PROJECT.name, target: deployment.target, status: state, url: deployment.url ? `https://${deployment.url}` : null, browserVerification: 'pending' }, null, 2));
      return deployment;
    }
    if (state === 'ERROR' || state === 'CANCELED') throw new Error(`Deployment ${state}. Check Vercel build logs; no automatic redeployment will be attempted.`);
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  throw new Error(`Deployment is still pending. Resume with --watch ${id}; do not repeat the create request.`);
}

async function main() {
  const [mode, id] = process.argv.slice(2);
  if (!['--dry-run', '--check', '--deploy', '--watch'].includes(mode)) throw new Error('Choose --dry-run, --check, --deploy, or --watch <deployment-id>.');
  if (mode === '--dry-run') {
    const payload = deploymentPayload(await sourceFiles());
    console.log(JSON.stringify({ project: PROJECT, target: payload.target, forceNew: true, sourceHash: payload.meta.flyersSourceHash, fileCount: payload.files.length, totalBytes: Buffer.byteLength(JSON.stringify(payload)), files: payload.files.map(f => f.file), networkRequests: 0 }, null, 2));
    return;
  }
  const request = apiClient(process.env.VERCEL_TOKEN, fetch, { accountScoped: process.env.VERCEL_TOKEN_SCOPE === 'account' });
  if (mode === '--check') {
    const project = await verifyProject(request);
    console.log(JSON.stringify({ connected: true, project: project.name, projectId: project.id, teamId: project.accountId, writeAccess: 'not tested' }, null, 2));
    return;
  }
  if (mode === '--watch') {
    if (!/^dpl_[A-Za-z0-9]+$/.test(id || '')) throw new Error('Provide a valid deployment ID.');
    await verifyProject(request);
    const deployment=await watch(request, id);
    const alias=await assignProductionAlias(request,deployment.id);
    console.log(`Assigned production alias https://${alias.alias}`);
    return;
  }
  const check = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'check'], { cwd: fileURLToPath(ROOT), stdio: 'inherit' });
  if (check.status !== 0) throw new Error('Tests or build failed. Nothing was uploaded.');
  await ensureProductionIsPublic(request);
  console.log('Vercel Authentication is limited to preview deployments; production is public.');
  const files = await sourceFiles();
  // Do not retry this POST automatically. A lost response can still mean the
  // deployment was created; inspect Vercel before submitting another build.
  const result = await createDeployment(request, files);
  const sourceHash = deploymentPayload(files).meta.flyersSourceHash;
  await saveReceipt(result, { sourceHash });
  console.log(`Created deployment ${result.id} in existing project ${PROJECT.name}.`);
  const deployment=await watch(request, result.id);
  const alias=await assignProductionAlias(request,deployment.id);
  await saveReceipt(deployment,{sourceHash,productionAlias:`https://${alias.alias}`});
  console.log(`Assigned production alias https://${alias.alias}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
