import {test} from 'node:test';import assert from 'node:assert/strict';import {blank,type Contact,type Activity} from '../lib/model.ts';import {draftFor,nextAfterSend,dailyQueue,linkedinProfile,researchContext,researchSource,personalizedContext,connectionNote,canSendConnectionRequest,actualLinkedinActionDay,defaultManualMessageKind,canRecordPastRequest,verifiedLinkedinConnection,exportedLinkedinInvitation,needsLinkedinMessageReview,missingDraftState,nextOutboundBatch,readyOutboundCandidates,pullForwardNotes} from '../lib/outreach.ts';
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

test('the available-pool summary explains why unscheduled leads cannot be assigned',()=>{
 const eligible={...c('Founder','New',null),title:'Founder',company:'Independent Freight',notes:'Research'};
 const blocked={...c('Other','New',null),title:'VP',company:'Busy Logistics',notes:'Research'};
 const contacted={...c('Contacted','Contacted','2026-11-25'),company:'Busy Logistics'};
 const missing={...c('No profile','New',null),company:'Unknown',title:'CEO',linkedin:''};
 const pool=nextOutboundBatch([eligible,blocked,contacted,missing],[],'2026-11-22');
 assert.equal(pool.pool.unscheduled,3);assert.equal(pool.pool.withProfile,2);assert.equal(pool.pool.withoutProfile,1);
 assert.equal(pool.pool.blockedByCompany,1);
 assert.deepEqual(pool.items.map(x=>x.name),['Founder']);
});

test('LinkedIn archive connection blocks duplicate connection request and outreach until history review',()=>{
 const c0={...c('A','New',null),company:'Freight Corp',title:'CEO',notes:'LinkedIn connection verified: 20 Nov 2026\nLinkedIn opener history: NOT VERIFIED\nResearch insight: Carrier updates\nResearch source: https://example.com\nResearch outreach draft: Hey A, how do you handle updates?'};
 assert.equal(verifiedLinkedinConnection(c0),'20 Nov 2026');
 assert.equal(needsLinkedinMessageReview(c0),true);
 assert.equal(canSendConnectionRequest(c0,[]),false);
 assert.equal(draftFor(c0,[]).ready,false);
 assert.equal(nextOutboundBatch([c0],[],'2026-11-22').items.length,0);
 const reviewed={...c0,notes:c0.notes+'\nLinkedIn opener review: no prior DM confirmed by user on 2026-11-22'};
 assert.equal(needsLinkedinMessageReview(reviewed),false);
 assert.equal(draftFor(reviewed,[]).ready,true);
 assert.deepEqual(nextOutboundBatch([reviewed],[],'2026-11-22').items.map(x=>x.id),['A']);
});
test('Outgoing invitation in archive suppresses repeated requests without asserting acceptance',()=>{
 const c0={...c('A','New',null),company:'Freight Corp',title:'CEO',notes:'LinkedIn invitation exported: 11/22/26, 12:45 AM; acceptance unknown'};
 assert.ok(exportedLinkedinInvitation(c0));assert.equal(canSendConnectionRequest(c0,[]),false);
 assert.equal(draftFor(c0,[]).ready,false);
 assert.equal(nextOutboundBatch([c0],[],'2026-11-22').items.length,0);
});

test('an exhausted LinkedIn pool reports connections awaiting history review separately',()=>{
 const needs={...c('Review','New',null),company:'Uncontacted Freight',title:'CEO',priority:'High',notes:'LinkedIn connection verified: 20 Nov 2026\nLinkedIn opener history: NOT VERIFIED'};
 const noProfile={...c('Missing','New',null),company:'Another Freight',title:'VP',linkedin:''};
 const plan=nextOutboundBatch([needs,noProfile],[],'2026-11-22');
 assert.equal(plan.items.length,0);
 assert.equal(plan.pool.pendingHistoryReview,1);
 assert.equal(plan.pool.withoutProfile,1);
 assert.equal(plan.pool.blockedByCompany,0);
});

test('manual sent messages do not require any prewritten personalized draft',()=>{
 const contact={...c('Andrew','New','2026-11-22'),company:'NUAGE Logistics Inc.',notes:'LinkedIn connection verified: 15 Oct 2026\nLinkedIn opener review: no prior DM confirmed by user on 2026-11-22'};
 assert.equal(draftFor(contact,[]).ready,false);
 assert.equal(defaultManualMessageKind(contact,[]),'First outreach sent');
 assert.equal(canRecordPastRequest(contact,[]),true);
 assert.equal(defaultManualMessageKind({...contact,status:'Contacted'},[a('Andrew','First outreach sent')]),'Follow-up sent');
 assert.equal(canRecordPastRequest(contact,[a('Andrew','Connection request sent')]),false);
});
test('manual backfills count on their actual sent day rather than date entered in CRM',()=>{
 const contact={...c('Andrew','Contacted','2026-11-25'),company:'NUAGE Logistics Inc.'};
 const historical={...a('Andrew','First outreach sent','2026-11-22T12:00:00Z'),notes:'Actual LinkedIn send date: 2026-11-18\nRecorded manually in CRM on 2026-11-22'};
 assert.equal(actualLinkedinActionDay(historical),'2026-11-18');
 assert.equal(dailyQueue([contact],[historical],'2026-11-22').newToday,0);
 assert.equal(dailyQueue([contact],[historical],'2026-11-18').newToday,1);
 const todayEntry={...historical,notes:'Actual LinkedIn send date: 2026-11-22\nRecorded manually in CRM on 2026-11-22'};
 assert.equal(dailyQueue([contact],[todayEntry],'2026-11-22').newToday,1);
});

test('additional assignments prefer existing source-backed personalized drafts',()=>{
 const ready={...c('Ready','New',null),company:'Ready Logistics',title:'Director',notes:'Personalized checked: 2026-11-22\nPersonalized basis: none\nPersonalized status: New\nPersonalized source: https://example.org/company\nPersonalized insight: Freight forwarding\nPersonalized draft: Hey Ready, I saw your public operations process. How do you handle exceptions?'};
 const empty={...c('Empty','New',null),company:'Empty Logistics',title:'CEO',notes:'Research seed'};
 const plan=nextOutboundBatch([empty,ready],[],'2026-11-22');
 assert.equal(plan.items[0].id,'Ready');assert.equal(plan.readyBuffer,1);
});

test('extra assignment exposes only prospects with ready source-backed drafts',()=>{
 const ready={...c('Ready','New',null),company:'Ready 3PL',title:'Operations Director',priority:'High',notes:'Personalized checked: 2026-11-22\nPersonalized basis: none\nPersonalized status: New\nPersonalized insight: The company offers cross-dock and parcel delivery\nPersonalized source: https://example.org/company\nPersonalized draft: Hey Ready, I saw your cross-dock network. How do you handle handoffs between dispatch and the warehouse?'};
 const notReady={...c('Not ready','New','2026-11-25'),company:'Other Freight',title:'CEO',priority:'High',notes:'Research missing'};
 const done={...c('Done','New',null),company:'Messaged Freight',title:'CEO',notes:ready.notes};
 const items=readyOutboundCandidates([notReady,ready,done],[a('Done','First outreach sent')],'2026-11-22');
 assert.deepEqual(items.map(c=>c.name),['Ready']);
 assert.equal(nextOutboundBatch([notReady,ready],[],'2026-11-22').items.length,2);
});

test('missing-draft cards distinguish pending connections from research gaps',()=>{
 const contact={...c('Dana','Contacted','2026-11-26'),company:'Freight Corp'};
 const pending=a('Dana','Connection request sent');
 assert.equal(missingDraftState(contact,[pending]).title,'Connection request pending');
 assert.equal(missingDraftState({...contact,notes:'LinkedIn connection verified: 2026-11-20'},[pending]).title,'Connection accepted');
 assert.equal(missingDraftState({...contact,status:'New'},[]).title,'Personalization required');
 assert.equal(missingDraftState({...contact,notes:'LinkedIn opener history: NOT VERIFIED'},[]).title,'Review previous DMs');
});

test('ready researched conversations appear before unprepared and pending connection checks',()=>{
 const date='2026-11-26';
 const pending={...c('Pending','Contacted','2026-11-24'),company:'Pending Freight'};
 const noDraft={...c('No draft','Contacted','2026-11-24'),company:'No Draft Logistics'};
 const ready={...c('Ready','Contacted','2026-11-26'),company:'Ready Logistics',notes:'Personalized checked: 2026-11-26\nPersonalized basis: ReadyFirst outreach sent\nPersonalized status: Contacted\nPersonalized insight: A public warehouse and transport offering\nPersonalized source: https://example.org/about\nPersonalized draft: Hey Ready, I noticed your warehousing network. Would a focused exception-triage workflow be useful to your operations team?'};
 const history=[a('Pending','Connection request sent'),a('No draft','First outreach sent'),a('Ready','First outreach sent')];
 const plan=dailyQueue([pending,noDraft,ready],history,date);
 assert.deepEqual(plan.follow.map(x=>x.name),['Ready','No draft']);
 assert.equal(plan.pendingTotal,1);
 assert.deepEqual(plan.pending.map(x=>x.name),['Pending']);
});
test('confirmed LinkedIn connection with a recorded request can receive a researched DM',()=>{
 const linked={...c('Accepted','Contacted','2026-11-26'),company:'Freight Logistics',notes:'LinkedIn connection verified: 2026-11-20\nPersonalized checked: 2026-11-26\nPersonalized basis: AcceptedConnection request sent\nPersonalized status: Contacted\nPersonalized insight: Company specializes in road freight\nPersonalized source: https://example.org\nPersonalized draft: Hey Accepted, I noticed your road-freight focus. Which carrier exception still needs manual review?'};
 const plan=dailyQueue([linked],[a('Accepted','Connection request sent')],'2026-11-26');
 assert.equal(plan.pendingTotal,0);
 assert.equal(plan.follow[0].name,'Accepted');
});
