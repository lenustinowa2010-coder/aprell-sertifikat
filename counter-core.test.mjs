import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readCounter,reserveNumber} from './counter-core.mjs';
import {parseNumbers} from './sheet-numbers.mjs';
class Storage {
  data=new Map(); queue=Promise.resolve();
  transaction(fn){const result=this.queue.then(async()=>{const draft=new Map(this.data);const result=await fn({get:async k=>draft.get(k),put:async(k,v)=>draft.set(k,v)});this.data=draft;return result;});this.queue=result.catch(()=>{});return result;}
}
const issue=(number,manual=true)=>({action:'issue',number,manual,requestId:randomUUID()});
test('CSV checks only exact four digits in number column, preserves zeros and quoted newlines',()=>{
  assert.deepEqual([...parseNumbers('\uFEFFДата,Порядковый номер,Примечание\r\n2026,0585,"hello,\nworld"\r\n2026,05632,test\n2026,A0068,test\n2026,0001,test\n')],['0585','0001']);
  assert.throws(()=>parseNumbers('<html>Login</html>'));
});
test('Preview skips sheet entries without consuming or reusing issued manual numbers',async()=>{
  const s=new Storage(),sheet=new Set(['0586','0587']);
  assert.deepEqual(await readCounter(s,sheet),{last:'0585',next:'0588'});
  await reserveNumber(s,issue('0588'),sheet);
  assert.deepEqual(await readCounter(s,sheet),{last:'0585',next:'0589'});
  await assert.rejects(reserveNumber(s,issue('0587'),sheet),/таблице/);
});
test('Concurrent issuance has one winner; idempotent retry survives later sheet addition',async()=>{
  const s=new Storage(),req=issue('0586',false);
  const outcomes=await Promise.allSettled([reserveNumber(s,req),...Array.from({length:9},()=>reserveNumber(s,issue('0586',false)))]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  assert.equal((await reserveNumber(s,req,new Set(['0586']))).issued,true);
  assert.deepEqual(await readCounter(s),{last:'0586',next:'0587'});
  await assert.rejects(reserveNumber(s,{...req,number:'0587'}),/Запрос/);
});
test('Next reserves from shared sequence; manual long issuance does not move it',async()=>{
  const s=new Storage();const req={action:'next',requestId:randomUUID()};
  const allocated=await reserveNumber(s,req,new Set(['0586']));assert.equal(allocated.number,'0587');
  await assert.rejects(reserveNumber(s,issue('0587')),/другим/);
  await reserveNumber(s,{...issue('0587',false),reservationId:req.requestId});
  await reserveNumber(s,issue('900000001'));assert.equal((await readCounter(s)).next,'0588');
  await assert.rejects(reserveNumber(s,issue('900000001')),/выпущен/);
});
