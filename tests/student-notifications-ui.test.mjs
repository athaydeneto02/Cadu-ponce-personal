import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';

const compiled = await build({ entryPoints: ['src/lib/useStudentNotifications.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'student-inbox-services', setup(builder) {
    builder.onResolve({ filter: /^(react|\.\/storage|\.\/supabase)$/ }, ({ path }) => ({ path, namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({ contents: path === 'react'
      ? 'export const {useState,useEffect,useRef,useCallback} = globalThis.testReact;'
      : path === './storage' ? 'export const storage = globalThis.testStorage;' : 'export const supabase = globalThis.testSupabase;', loader: 'js' }));
  } }],
});
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const row = id => ({ id, recipientId: 'student-a', title: 'Nova ficha', body: 'Consulte seus treinos', type: 'routine', createdAt: '2026-11-05T12:00:00Z' });
const deferred = () => { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };
function harness() {
  let rows=[row('first')], actor='student-a', readGate=null, fetchGate=null, fetchCount=0;
  const state=[], effects=[], reads=[], callbacks=new Map(), timers=new Map();
  let cursor=0, first=true, realtime;
  const react={
    useState(initial) { const index=cursor++; if(first) state[index]=typeof initial==='function'?initial():initial; return [state[index],next=>{state[index]=typeof next==='function'?next(state[index]):next;}]; },
    useRef(initial) { const index=cursor++; if(first) state[index]={current:initial}; return state[index]; },
    useEffect(effect) { if(first)effects.push(effect); }, useCallback:fn=>fn,
  };
  const target={addEventListener(name,fn){callbacks.set(name,fn);},removeEventListener(name){callbacks.delete(name);}};
  const channel={on(_event,options,handler){assert.equal(options.table,'student_notifications'); assert.equal(options.filter,'recipient_id=eq.student-a'); realtime=handler; return this;},subscribe(){return this;}};
  const context={module:{exports:{}},testReact:react,console,
    testStorage:{getUser:()=>({uid:actor}),fetchStudentNotifications:async id=>{assert.equal(id,'student-a');fetchCount++;return fetchGate?fetchGate.promise:structuredClone(rows);},
      markStudentNotificationRead:async id=>{reads.push(id);if(readGate)await readGate.promise;}},
    testSupabase:{channel:()=>channel,removeChannel:async()=>{}},window:target,document:{...target,visibilityState:'visible'},
    setInterval:fn=>{const id=timers.size;timers.set(id,fn);return id;},clearInterval:id=>timers.delete(id),
  };
  context.exports=context.module.exports;vm.runInNewContext(compiled.outputFiles[0].text,context);
  const render=()=>{cursor=0;const result=context.module.exports.useStudentNotifications('student-a');first=false;return result;};
  render();const cleanups=effects.map(effect=>effect());
  return {render,reads,setRows:values=>rows=values,setReadGate:value=>readGate=value,setFetchGate:value=>fetchGate=value,switchActor:value=>actor=value,
    fetches:()=>fetchCount,realtime:()=>realtime(),event:name=>callbacks.get(name)?.(),close:()=>cleanups.forEach(fn=>fn?.()),timers};
}
test('student inbox refreshes real notices and preserves acknowledged reads against stale snapshots',async()=>{
  const app=harness();await settle();assert.equal(app.render().items.length,1);
  app.setRows([row('second'),row('first')]);app.realtime();await settle();assert.equal(app.render().items.length,2);
  await app.render().markRead(['first']);assert.ok(app.render().items.find(item=>item.id==='first').readAt);
  app.event('focus');await settle();assert.ok(app.render().items.find(item=>item.id==='first').readAt);
  app.close();assert.equal(app.timers.size,0);
});
test('failed read confirmation leaves the student notice unread and supports retry',async()=>{
  const app=harness();await settle();const gate=deferred();app.setReadGate(gate);
  const pending=app.render().markRead(['first']);assert.equal(app.render().busy,true);assert.equal(app.render().items[0].readAt,undefined);
  gate.reject(new Error('Denied'));await pending;assert.equal(app.render().items[0].readAt,undefined);assert.match(app.render().error,/não confirmados/);
  app.setReadGate(null);await app.render().markRead(['first']);assert.ok(app.render().items[0].readAt);app.close();
});
test('an in-flight response after account switch is ignored and cannot mark the next account notices',async()=>{
  const app=harness();await settle();const gate=deferred();app.setFetchGate(gate);const pending=app.render().refresh();
  app.switchActor('student-b');gate.resolve([row('private-new')]);await pending;
  assert.equal(app.render().items.some(item=>item.id==='private-new'),false);
  await app.render().markRead(['first']);assert.equal(app.reads.length,0);app.close();
});
