import test from 'node:test';
import assert from 'node:assert/strict';
import { PROJECT, PRODUCTION_ALIAS, apiClient, assignProductionAlias, createDeployment, deploymentPayload, sourceFiles } from '../scripts/deploy-api.mjs';

test('deployment source list excludes credentials and generated files', async () => {
  const files = await sourceFiles();
  assert.ok(files.some(f => f.file === 'public/index.html'));
  assert.ok(files.some(f => f.file === 'api/generate.js'));
  for (const { file } of files) assert.ok(!/(^|\/)(\.env|\.vercel|node_modules|dist)(\/|\.|$)/.test(file), file);
  assert.equal(new Set(files.map(f => f.file)).size, files.length);
});
test('API payload pins production to the verified existing project', () => {
  const payload = deploymentPayload([{ file: 'index.html', data: 'test', encoding: 'utf-8' }]);
  assert.equal(payload.project, PROJECT.id);
  assert.equal(payload.name, 'flyers');
  assert.equal(payload.target, 'production');
  assert.match(payload.meta.flyersSourceHash, /^[a-f0-9]{64}$/);
});
test('wrong project identity stops before any deployment mutation', async () => {
  let calls = 0;
  await assert.rejects(createDeployment(async () => { calls++; return { ...PROJECT, accountId: 'wrong-team' }; }, []), /identity mismatch/);
  assert.equal(calls, 1);
});
test('REST client requires a token and sends it only to the official API', async () => {
  assert.throws(() => apiClient(''), /VERCEL_TOKEN/);
  let captured;
  const client = apiClient('test-only-placeholder', async (url, options) => { captured = { url, options }; return { ok: true, json: async () => ({ id: PROJECT.id }) }; });
  await assert.rejects(client('https://other.example/path'), /Invalid/);
  await client('/v13/deployments', { method: 'POST', forceNew: true, body: { project: PROJECT.id } });
  assert.equal(captured.url.origin, 'https://api.vercel.com');
  assert.equal(captured.url.searchParams.get('teamId'), null);
  assert.equal(captured.url.searchParams.get('forceNew'), '1');
  assert.equal(captured.options.redirect, 'error');
  assert.equal(captured.options.headers.Authorization, 'Bearer test-only-placeholder');
  const accountClient = apiClient('test-only-placeholder', async (url) => { captured = { url }; return { ok: true, json: async () => ({}) }; }, { accountScoped: true });
  await accountClient(`/v9/projects/${PROJECT.id}`);
  assert.equal(captured.url.searchParams.get('teamId'), PROJECT.teamId);
});
test('production alias is pinned to pcswireless.vercel.app', async () => {
  assert.equal(PRODUCTION_ALIAS,'pcswireless.vercel.app');
  const calls=[];
  const result=await assignProductionAlias(async(path,options)=>{calls.push({path,options});return {alias:PRODUCTION_ALIAS,uid:'alias_test'};},'dpl_test123');
  assert.equal(result.alias,PRODUCTION_ALIAS);
  assert.equal(calls[0].path,'/v2/deployments/dpl_test123/aliases');
  assert.deepEqual(calls[0].options.body,{alias:PRODUCTION_ALIAS,redirect:null});
});
test('deployment validates the project before posting and returns its ID', async () => {
  const calls = [];
  const request = async (path, options) => {
    calls.push({ path, options });
    return calls.length === 1 ? { id: PROJECT.id, name: PROJECT.name, accountId: PROJECT.teamId } : { id: 'dpl_test123', readyState: 'QUEUED' };
  };
  const result = await createDeployment(request, [{ file: 'index.html', data: 'test', encoding: 'utf-8' }]);
  assert.equal(result.id, 'dpl_test123');
  assert.equal(calls[0].path, `/v9/projects/${PROJECT.id}`);
  assert.equal(calls[1].options.body.project, PROJECT.id);
  assert.equal(calls[1].options.forceNew, true);
});
