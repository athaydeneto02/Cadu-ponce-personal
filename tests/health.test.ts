import test from 'node:test';
import assert from 'node:assert/strict';
import { createHealthHandler } from '../server/health.ts';

function response() { return { code: 0, body: undefined as unknown, headers: {} as Record<string,string>, setHeader(name: string,value: string) { this.headers[name]=value; }, status(code: number) { this.code=code; return this; }, json(body: unknown) { this.body=body; return this; }, end() { return this; } }; }
test('health reports service availability without exposing records or internal errors', async () => {
  let calls=0;
  const handler=createHealthHandler(async () => { calls++; });
  const healthy=response(); await handler({method:'GET'},healthy);
  assert.equal(healthy.code,200); assert.deepEqual(healthy.body,{status:'ok'});
  const write=response(); await handler({method:'POST'},write);
  assert.equal(write.code,405); assert.equal(calls,1);
  const failure=response(); await createHealthHandler(async () => { throw new Error('secret private database details'); })({method:'GET'},failure);
  assert.equal(failure.code,503); assert.deepEqual(failure.body,{status:'unavailable'});
  assert.equal(failure.headers['Cache-Control'],'no-store');
  const head=response(); await handler({method:'HEAD'},head); assert.equal(head.code,200); assert.equal(head.body,undefined);
});
