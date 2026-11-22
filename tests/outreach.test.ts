import {test} from 'node:test';import assert from 'node:assert/strict';import {blank,type Contact,type Activity} from '../lib/model.ts';import {draftFor,nextAfterSend,dailyQueue,linkedinProfile,researchContext,researchSource,personalizedContext,connectionNote,canSendConnectionRequest,nextOutboundBatch,pullForwardNotes} from '../lib/outreach.ts';
const c=(name:string,status='New',next_date:string|null='2026-11-16'):Contact=>({...blank,id:name,workspace_id:'w',name,status,next_date,created_at:'',priority:'High',linkedin:'https://www.linkedin.com/in/'+encodeURIComponent(name)});
const a=(contact_id:string,kind:string,created_at='2026-11-16T09:00:00'):Activity=>({id:contact_id+kind,workspace_id:'w',contact_id,kind,channel:'LinkedIn',notes:'',created_at});
test('never fabricate generic opener from a campaign alone',()=>{const x={...c('Alex'),company:'Freight Co',notes:'Recommended Campaign: Campaign 2 — Carrier Email → TMS Assignment'};assert.equal(draftFor(x,[]).text,'');assert.equal(draftFor(x,[]).ready,false);assert.equal(connectionNote(x),'')});
test('saved warm draft used only before new outbound history',()=>{const x={...c('Alex','Replied'),notes:'Suggested LinkedIn follow-up: Hi Alex, project scope?'};assert.equal(draftFor(x,[]).text,'Hi Alex, project scope?');assert.notEqual(draftFor(x,[a('Alex','Follow-up sent')]).text,'Hi Alex, project scope?')});
test('connection review and two follow-up limit',()=>{const x=c('Alex','Contacted');assert.equal(draftFor(x,[a('Alex','Connection request sent')]).text,'');assert.equal(nextAfterSend(x,[a('Alex','Follow-up sent')],'Follow-up sent',new Date(2026,10,16,12)).status,'Nurture');assert.equal(nextAfterSend(x,[],'First outreach sent',new Date(2026,10,16,12)).date,'2026-11-19')});
test('daily queue respects status, dates and caps',()=>{const rows=Array.from({length:8},(_,i)=>c('New '+i));rows.push(c('Warm','Interested'),c('Paused','Nurture'),c('Closed','Do not contact'),c('Later','New','2026-11-17'));const plan=dailyQueue(rows,[a('Different','First outreach sent')],'2026-11-16');assert.equal(plan.first.length,4);assert.equal(plan.follow.length,1);assert.equal(plan.follow[0].name,'Warm')});
test('accept genuine country LinkedIn profile subdomains but reject lookalikes',()=>{assert.equal(linkedinProfile({...c('A'),linkedin:'https://linkedin.com.evil.test/in/a'}),null);assert.equal(linkedinProfile({...c('A'),linkedin:'http://uk.linkedin.com/in/a'}),null);assert.equal(linkedinProfile({...c('A'),linkedin:'https://uk.linkedin.com/not-a-profile'}),null);assert.ok(linkedinProfile({...c('A'),linkedin:'https://www.linkedin.com/in/a'}));assert.ok(linkedinProfile({...c('A'),linkedin:'https://uk.linkedin.com/in/a'}));assert.ok(linkedinProfile({...c('A'),linkedin:'https://nl.linkedin.com/in/a'}))});

test('sourced research draft works for a new lead, historical warm draft only before a recorded outbound',()=>{const x={...c('Alex'),notes:'Research checked: 2026-11-15\nResearch insight: Company offers tracking\nResearch source: https://example.com/\nResearch outreach draft: Hey Alex, how do exceptions work?'};assert.equal(draftFor(x,[]).text,'Hey Alex, how do exceptions work?');assert.equal(researchContext(x).checked,'2026-11-15');assert.equal(researchSource('javascript:alert(1)'),null);assert.equal(draftFor({...x,status:'Replied',notes:x.notes+'\nOutreach draft: Manual draft'},[]).text,'Manual draft');assert.equal(draftFor({...x,status:'Contacted'},[a('Alex','First outreach sent')]).text,'')});

test('extra outbounds pull from earliest future date only, in priority order',()=>{
 const rows=[c('Tomorrow low','New','2026-11-17'),c('Tomorrow high','New','2026-11-17'),c('Later','New','2026-11-18'),c('Warm','Interested','2026-11-17'),c('Already sent','New','2026-11-17'),{...c('No profile','New','2026-11-17'),linkedin:''}];rows.forEach((r,i)=>{r.company='Unique freight '+i;r.title='Operations';});
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

test('personalized draft is stage and last-activity specific',()=>{
 const x={...c('Taylor'),notes:'Personalized basis: none\nPersonalized status: New\nPersonalized insight: Company has a TMS\nPersonalized source: https://company.com\nPersonalized draft: Hey Taylor, saw your TMS setup.\nPersonalized connection: Hi Taylor, your freight operation stood out.'};
 assert.equal(draftFor(x,[]).text,'Hey Taylor, saw your TMS setup.');
 assert.match(connectionNote(x),/freight operation/);
 assert.equal(draftFor({...x,status:'Contacted'},[a('Taylor','First outreach sent')]).text,'');
 const activity=a('Taylor','First outreach sent');const stage={...x,status:'Contacted',notes:'Personalized basis: '+activity.id+'\nPersonalized status: Contacted\nPersonalized draft: Hey Taylor, is the manual exception still there?'};
 assert.equal(draftFor(stage,[activity]).text,'Hey Taylor, is the manual exception still there?');
 assert.equal(draftFor(stage,[a('Taylor','Reply received')]).text,'');
 assert.equal(draftFor({...stage,notes:stage.notes.replace('manual exception still there','manual exception still there')},[{...activity,notes:'Hey Taylor, is the manual exception still there?'}]).text,'');
});
test('pending connection displays tailored DM only with acceptance warning',()=>{
 const activity=a('Taylor','Connection request sent');
 const x={...c('Taylor','Contacted'),notes:'Personalized basis: '+activity.id+'\nPersonalized status: Contacted\nPersonalized draft: Hey Taylor, your freight audit process caught my eye.'};
 const d=draftFor(x,[activity]);
 assert.equal(d.kind,'review');assert.match(d.guidance,/CONNECTION NOT CONFIRMED/);
 assert.match(d.text,/freight audit/);
});

test('connection option appears for New prospects even when no researched DM exists',()=>{
 const x=c('Sam');assert.equal(draftFor(x,[]).text,'');assert.equal(canSendConnectionRequest(x,[]),true);
 assert.equal(canSendConnectionRequest({...x,notes:'Personalized status: New\\nPersonalized basis: none'},[]),true);
});
test('connection option hides after sent request, DM, reply, or closed status',()=>{
 const x=c('Sam');for(const kind of ['Connection request sent','First outreach sent','Follow-up sent','Reply received'])assert.equal(canSendConnectionRequest(x,[a('Sam',kind)]),false);
 for(const status of ['Contacted','Nurture','Do not contact','Not interested','Converted'])assert.equal(canSendConnectionRequest({...x,status},[]),false);
});

test('extra outbounds use unscheduled researched prospects after the future-dated list is empty',()=>{
 const a1={...c('A','New',null),company:'Alpha Logistics',title:'CEO',notes:'Research only; profile to verify',priority:'High'};
 const b1={...c('B','New',null),company:'Beta Freight',title:'Head of Operations',notes:'Researched company',priority:'Medium'};
 const b2={...c('C','New',null),company:'Beta Freight',title:'Director',notes:'Researched company',priority:'Medium'};
 const paused={...c('D','Nurture',null),company:'Gamma Logistics'};
 const blocked={...c('E','New',null),company:'Gamma Logistics',title:'Owner',notes:'Research'};
 const old={...c('F','New',null),company:'Old Freight',title:'Founder',notes:'Research'};
 const missing={...c('G','New',null),company:'Missing Freight',title:'Founder',notes:'Research',linkedin:''};
 const batch=nextOutboundBatch([b1,blocked,paused,b2,a1,old,missing],[a('F','Connection request sent')],'2026-11-22');
 assert.equal(batch.date,null);assert.equal(batch.scheduledCount,0);assert.equal(batch.unscheduledCount,2);
 assert.deepEqual(batch.items.map(x=>x.name),['A','B']);
 const pulled={...a1,next_date:'2026-11-22',notes:pullForwardNotes(a1,'2026-11-22')};
 const plan=dailyQueue([pulled],[],'2026-11-22');
 assert.equal(plan.newLimit,6);assert.deepEqual(plan.first.map(c=>c.name),['A']);
});
test('top-up fills from unscheduled after earliest scheduled future batch, skipping duplicate company',()=>{
 const future={...c('Future','New','2026-11-24'),company:'One Ltd',title:'Director',notes:'Research',priority:'High'};
 const unsched={...c('New pool','New',null),company:'Two Ltd',title:'CEO',notes:'Research',priority:'Medium'};
 const duplicate={...c('Duplicate','New',null),company:'One Ltd',title:'CEO',notes:'Research',priority:'High'};
 const batch=nextOutboundBatch([future,unsched,duplicate],[],'2026-11-22');
 assert.equal(batch.date,'2026-11-24');assert.equal(batch.scheduledCount,1);assert.equal(batch.unscheduledCount,1);
 assert.deepEqual(batch.items.map(x=>x.name),['Future','New pool']);
});
test('no eligible assignment when company has a suppressed or active record',()=>{
 const lead={...c('Lead','New',null),company:'X Freight',title:'Operations Director',notes:'Research'};
 const suppressed={...c('Suppressed','Do not contact',null),company:'X Freight'};
 assert.deepEqual(nextOutboundBatch([lead,suppressed],[],'2026-11-22').items,[]);
});
