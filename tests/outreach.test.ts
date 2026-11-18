import {test} from 'node:test';import assert from 'node:assert/strict';import {blank,type Contact,type Activity} from '../lib/model.ts';import {draftFor,nextAfterSend,dailyQueue,linkedinProfile,researchContext,researchSource,nextOutboundBatch,pullForwardNotes} from '../lib/outreach.ts';
const c=(name:string,status='New',next_date:string|null='2026-11-16'):Contact=>({...blank,id:name,workspace_id:'w',name,status,next_date,created_at:'',priority:'High',linkedin:'https://www.linkedin.com/in/'+encodeURIComponent(name)});
const a=(contact_id:string,kind:string,created_at='2026-11-16T09:00:00'):Activity=>({id:contact_id+kind,workspace_id:'w',contact_id,kind,channel:'LinkedIn',notes:'',created_at});
test('new message uses campaign and is not a claim of existing pain',()=>{const x={...c('Alex'),company:'Freight Co',notes:'Recommended Campaign: Campaign 2 — Carrier Email → TMS Assignment'};assert.match(draftFor(x,[]).text,/carrier emails/);assert.match(draftFor(x,[]).text,/Curious/);});
test('saved warm draft used only before new outbound history',()=>{const x={...c('Alex','Replied'),notes:'Suggested LinkedIn follow-up: Hi Alex, project scope?'};assert.equal(draftFor(x,[]).text,'Hi Alex, project scope?');assert.notEqual(draftFor(x,[a('Alex','Follow-up sent')]).text,'Hi Alex, project scope?')});
test('connection review and two follow-up limit',()=>{const x=c('Alex','Contacted');assert.equal(draftFor(x,[a('Alex','Connection request sent')]).kind,'review');assert.equal(nextAfterSend(x,[a('Alex','Follow-up sent')],'Follow-up sent',new Date(2026,10,16,12)).status,'Nurture');assert.equal(nextAfterSend(x,[],'First outreach sent',new Date(2026,10,16,12)).date,'2026-11-19')});
test('daily queue respects status, dates and caps',()=>{const rows=Array.from({length:8},(_,i)=>c('New '+i));rows.push(c('Warm','Interested'),c('Paused','Nurture'),c('Closed','Do not contact'),c('Later','New','2026-11-17'));const plan=dailyQueue(rows,[a('Different','First outreach sent')],'2026-11-16');assert.equal(plan.first.length,4);assert.equal(plan.follow.length,1);assert.equal(plan.follow[0].name,'Warm')});
test('reject unsafe LinkedIn URLs',()=>{assert.equal(linkedinProfile({...c('A'),linkedin:'https://linkedin.com.evil.test/in/a'}),null);assert.ok(linkedinProfile({...c('A'),linkedin:'https://www.linkedin.com/in/a'}))});

test('research opener uses sourced draft and preserves manually authored warm draft',()=>{const x={...c('Alex'),notes:'Research checked: 2026-11-15\nResearch insight: Company offers tracking\nResearch source: https://example.com/\nResearch outreach draft: Hey Alex, how do exceptions work?'};assert.equal(draftFor(x,[]).text,'Hey Alex, how do exceptions work?');assert.equal(researchContext(x).checked,'2026-11-15');assert.equal(researchSource('javascript:alert(1)'),null);assert.equal(draftFor({...x,status:'Replied',notes:x.notes+'\nOutreach draft: Manual draft'},[]).text,'Manual draft')});

test('extra outbounds pull from earliest future date only, in priority order',()=>{
 const rows=[c('Tomorrow low','New','2026-11-17'),c('Tomorrow high','New','2026-11-17'),c('Later','New','2026-11-18'),c('Warm','Interested','2026-11-17'),c('Already sent','New','2026-11-17'),{...c('No profile','New','2026-11-17'),linkedin:''}];
 rows[0].priority='Low';
 const batch=nextOutboundBatch(rows,[a('Already sent','First outreach sent')],'2026-11-16');
 assert.equal(batch.date,'2026-11-17');assert.deepEqual(batch.items.map(x=>x.name),['Tomorrow high','Tomorrow low']);
});
test('pulled outbounds appear beyond base quota and remain counted after sending',()=>{
 const day='2026-11-16',base=Array.from({length:10},(_,i)=>c('Base '+i));
 const original=c('Pulled','New','2026-11-17');
 const moved={...original,next_date:day,notes:pullForwardNotes(original,day)};
 assert.equal(pullForwardNotes(moved,day),moved.notes);
 const plan=dailyQueue([...base,moved],[],day);
 assert.equal(plan.newLimit,6);assert.equal(plan.first.length,6);assert.ok(plan.first.some(x=>x.id===moved.id));
 const after=dailyQueue([...base,{...moved,status:'Contacted',next_date:'2026-11-19'}],[a(moved.id,'First outreach sent')],day);
 assert.equal(after.newLimit,6);assert.equal(after.first.length,5);
 assert.equal(dailyQueue([moved],[],'2026-11-17').newLimit,5);
});
