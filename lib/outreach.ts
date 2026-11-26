import {businessDays,dateKey,inactive,priorities,sortFollowUps,type Contact,type Activity} from './model.ts';

export const NEW_LIMIT=5;
export const FOLLOW_LIMIT=12;
const outbound=['First outreach sent','Follow-up sent','Connection request sent'];
const replies=['Reply received','Positive reply','Meeting booked','Meeting completed','Reply','Meeting'];
export function linkedinProfile(c:Contact){try{const u=new URL(c.linkedin);return u.protocol==='https:'&&(u.hostname.toLowerCase()==='linkedin.com'||u.hostname.toLowerCase().endsWith('.linkedin.com'))&&/^\/in\/[^/]+/i.test(u.pathname)?u.href:null}catch{return null}}
export function firstName(c:Contact){if(/\b(llc|ltd|inc|logistics llc|surname unavailable)\b/i.test(c.name))return '';return c.name.trim().replace(/^[^\p{L}]+/u,'').split(/\s+/)[0]||''}
export function noteField(notes:string,label:string){const line=notes.split(/\r?\n/).reverse().find(l=>l.startsWith(label+':'));return line?.slice(label.length+1).trim()||''}
export function researchContext(c:Contact){return {insight:noteField(c.notes,'Research insight'),source:noteField(c.notes,'Research source'),checked:noteField(c.notes,'Research checked'),draft:noteField(c.notes,'Research outreach draft')}}
export function researchSource(value:string){try{const u=new URL(value);return u.protocol==='https:'?u.href:null}catch{return null}}
export function contactHistory(c:Contact,activities:Activity[]){return activities.filter(a=>a.contact_id===c.id).sort((a,b)=>b.created_at.localeCompare(a.created_at))}
export function unansweredFollowUps(history:Activity[]){let n=0;for(const a of history){if(replies.includes(a.kind))break;if(a.kind==='Follow-up sent')n++}return n}
export function campaignTopic(c:Contact){const campaign=noteField(c.notes,'Recommended Campaign');const context=campaign||[c.title,c.industry,c.company].join(' ');if(/carrier email|carrier.*assignment|dispatch/i.test(context))return 'carrier emails, dispatch updates and TMS assignment';if(/rate confirmation|quote|broker/i.test(context))return 'rate confirmations and load details entering the TMS';if(/POD|billing|invoice|accounts payable|finance/i.test(context))return 'POD checks and invoice processing';if(/order entry|ERP|distribution/i.test(context))return 'order emails and ERP data entry';if(/warehouse|WMS/i.test(context))return 'warehouse updates and WMS handoffs';if(/load tender|freight|transport|logistics/i.test(context))return 'load requests and TMS data entry';return 'manual handoffs between email and operational systems'}

/** A prepared message is valid only for the precise CRM stage and activity it was researched against.
 * This prevents re-showing an opener as a follow-up once the user logs that opener as sent.
 */
export function personalizedContext(c:Contact,history:Activity[]){
 const basis=noteField(c.notes,'Personalized basis');
 const stage=noteField(c.notes,'Personalized status');
 const draft=noteField(c.notes,'Personalized draft');
 const connection=noteField(c.notes,'Personalized connection');
 const insight=noteField(c.notes,'Personalized insight');
 const source=noteField(c.notes,'Personalized source');
 const checked=noteField(c.notes,'Personalized checked');
 const last=contactHistory(c,history)[0]?.id||'none';
 const alreadySent=Boolean(draft&&history.some(a=>outbound.includes(a.kind)&&a.notes.trim().replace(/\s+/g,' ').toLowerCase()===draft.trim().replace(/\s+/g,' ').toLowerCase()));
 const valid=Boolean(draft&&basis===last&&stage===c.status&&!alreadySent&&(!source||researchSource(source)));
 return {draft,connection,insight,source,checked,basis,valid};
}
/** Allow a request even without a DM draft, but never if outreach or a reply was logged. */
export function verifiedLinkedinConnection(c:Contact){return noteField(c.notes,'LinkedIn connection verified')}
export function exportedLinkedinInvitation(c:Contact){return noteField(c.notes,'LinkedIn invitation exported')}
export function needsLinkedinMessageReview(c:Contact){return c.notes.includes('LinkedIn opener history: NOT VERIFIED')&&!c.notes.includes('LinkedIn opener review:')}
export function canSendConnectionRequest(c:Contact,history:Activity[]){
 return c.status==='New'&&!inactive(c)&&!verifiedLinkedinConnection(c)&&!exportedLinkedinInvitation(c)&&
 !history.some(a=>outbound.includes(a.kind)||replies.includes(a.kind));
}
export type ManualLinkedinAction='First outreach sent'|'Follow-up sent'|'Connection request sent';
/** The event's creation timestamp is when the CRM entry was saved; if provided,
 * the independently verified LinkedIn send date is carried in activity notes.
 * Never count historical backfills as messages newly sent today.
 */
export function actualLinkedinActionDay(a:Pick<Activity,'notes'|'created_at'>){
 const marked=a.notes.match(/(?:^|\n)Actual LinkedIn send date: (\d{4}-\d{2}-\d{2})(?:\n|$)/);
 return marked?.[1]??dateKey(new Date(a.created_at));
}
export function defaultManualMessageKind(c:Contact,history:Activity[]):ManualLinkedinAction{
 const previouslySent=history.some(a=>['First outreach sent','Follow-up sent','Sent'].includes(a.kind))||
 c.notes.includes('LinkedIn opener review: previous opener confirmed');
 return previouslySent?'Follow-up sent':'First outreach sent';
}
export function canRecordPastRequest(c:Contact,history:Activity[]){
 return !inactive(c)&&!history.some(a=>a.kind==='Connection request sent');
}
export function connectionNote(c:Contact){return c.status==='New'&&noteField(c.notes,'Personalized basis')==='none'&&noteField(c.notes,'Personalized status')==='New'?noteField(c.notes,'Personalized connection'):''}
export type Draft={text:string;kind:'initial'|'follow'|'review';guidance:string;topic:string;ready:boolean};
const noDraft=(guidance:string,topic:string):Draft=>({text:'',kind:'review',guidance,topic,ready:false});
export function draftFor(c:Contact,history:Activity[]):Draft{
 const topic=campaignTopic(c),historyOrdered=contactHistory(c,history),tailored=personalizedContext(c,historyOrdered);
 if(inactive(c)||c.status==='Nurture')return noDraft('Outreach paused or closed. Do not send.',topic);
 if(c.status==='Meeting booked')return noDraft('Prepare for the meeting. No generic follow-up.',topic);
 const latest=historyOrdered.find(a=>outbound.includes(a.kind)||replies.includes(a.kind));
 const followups=unansweredFollowUps(historyOrdered);
 if(followups>=2)return noDraft('Two unanswered follow-ups. Pause until a reply.',topic);
 if(c.status==='New'){
  if(needsLinkedinMessageReview(c))return noDraft('Connected. Check past DMs before drafting.',topic);
  if(exportedLinkedinInvitation(c)&&!verifiedLinkedinConnection(c))return noDraft('Invitation sent. Check acceptance. Do not resend.',topic);
  if(latest)return noDraft('Outreach logged. Review status before sending.',topic);
  if(tailored.valid)return {text:tailored.draft,kind:'initial',guidance:'Research ready. Check source and LinkedIn chat.',topic,ready:true};
  const researched=researchContext(c);
  if(researched.insight&&researchSource(researched.source)&&researched.draft&&
   !historyOrdered.some(a=>outbound.includes(a.kind)))
    return {text:researched.draft,kind:'initial',guidance:'Check company source and past DMs.',topic,ready:true};
  return noDraft('Needs research. Verify profile and chat.',topic);
 }
 if(latest?.kind==='Connection request sent'){
  if(tailored.valid)return {text:tailored.draft,kind:'review',guidance:'CONNECTION NOT CONFIRMED. Check acceptance before DM.',topic,ready:true};
  return noDraft('Check acceptance. Prepare a personal DM.',topic);
 }
 if(tailored.valid)return {text:tailored.draft,kind:'follow',guidance:'Check live thread before sending.',topic,ready:true};
 if(latest&&replies.includes(latest.kind))return noDraft('Reply logged. Respond to the actual message.',topic);
 if(historyOrdered.some(a=>outbound.includes(a.kind)))return noDraft('Research a new follow-up. Avoid repeated messages.',topic);
 const saved=noteField(c.notes,'Outreach draft')||noteField(c.notes,'Suggested LinkedIn follow-up');
 if(saved)return {text:saved,kind:'follow',guidance:'Review live thread and adjust draft.',topic,ready:true};
 return noDraft('No verified draft. Research this prospect.',topic);
}
export function missingDraftState(c:Contact,history:Activity[]){
 const h=contactHistory(c,history),last=h.find(a=>outbound.includes(a.kind)||replies.includes(a.kind));
 if(inactive(c)||c.status==='Nurture'||unansweredFollowUps(h)>=2)return {title:'Follow-up paused',detail:'Wait for a reply or new reason to reconnect.'};
 if(needsLinkedinMessageReview(c))return {title:'Review previous DMs',detail:'Check LinkedIn before drafting or resending.'};
 if(last?.kind==='Connection request sent')return verifiedLinkedinConnection(c)?
  {title:'Connection accepted',detail:'Check the live chat before sending a first DM.'}:
  {title:'Connection request pending',detail:'Check acceptance in LinkedIn. Do not resend.'};
 if(c.status==='New'&&exportedLinkedinInvitation(c))return {title:'Invitation pending',detail:'Confirm acceptance before a first DM.'};
 return {title:'Personalization required',detail:'The weekday planner prepares drafts. Check LinkedIn before sending.'};
}
export function nextAfterSend(c:Contact,history:Activity[],kind:string,start=new Date()){
 if(kind==='Connection request sent')return {status:c.status==='New'?'Contacted':c.status,date:businessDays(5,start),action:'LinkedIn: check connection acceptance; do not send a duplicate request'};
 if(kind==='First outreach sent')return {status:c.status==='New'?'Contacted':c.status,date:businessDays(3,start),action:'LinkedIn: check for reply; first follow-up if appropriate'};
 if(unansweredFollowUps(history)>=1)return {status:'Nurture',date:null,action:'Paused after two unanswered follow-ups; reconnect only on new signal or reply'};
 return {status:c.status==='New'?'Contacted':c.status,date:businessDays(5,start),action:'LinkedIn: check reply; final follow-up if appropriate'};
}
// Store pull-forward assignments on the contact so the extra daily quota survives refreshes and completed sends.
const pullMarker=(day:string)=>'Outbound pulled forward: '+day;
export function pulledForwardToday(c:Contact,day:string){return c.notes.split(/\r?\n/).some(line=>line.trim()===pullMarker(day))}
export function pullForwardNotes(c:Contact,day:string){return pulledForwardToday(c,day)?c.notes:[c.notes,pullMarker(day)].filter(Boolean).join('\n')}
// Earliest future scheduled batch first; then top up with researched, unscheduled LinkedIn prospects.
// Never reassign an active or suppressed company's additional contacts, or anyone with recorded outreach.
export function nextOutboundBatch(contacts:Contact[],activities:Activity[],today=dateKey()){
 const contacted=new Set(activities.filter(a=>outbound.includes(a.kind)||replies.includes(a.kind)).map(a=>a.contact_id));
 const companyKey=(c:Contact)=>c.company.trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const linkedinKey=(c:Contact)=>{const url=linkedinProfile(c);return url?new URL(url).pathname.toLowerCase().replace(/\/$/,''):''};
 const badCompany=(company:string)=>/^(?:chief\s|co[- ]?founder\b|founder\b|president\b|director\b|vice president\b|vp\b|ceo\b|coo\b|cfo\b|cto\b|owner\b|head of\b|operations manager\b|sales manager\b|logistics manager\b|managing director\b)/i.test(company.trim());
 const blocked=new Set(contacts.filter(c=>c.status!=='New'||c.next_date!==null).map(companyKey).filter(Boolean));
 const unscheduledAll=contacts.filter(c=>c.status==='New'&&c.next_date===null);
 const unscheduledWithProfile=unscheduledAll.filter(c=>linkedinProfile(c)!==null);
 const blockedByCompany=unscheduledWithProfile.filter(c=>blocked.has(companyKey(c))).length;
 const pendingHistoryReview=unscheduledWithProfile.filter(needsLinkedinMessageReview).length;
 const pendingInvitations=unscheduledWithProfile.filter(c=>!verifiedLinkedinConnection(c)&&Boolean(exportedLinkedinInvitation(c))).length;
 const valid=(c:Contact)=>c.status==='New'&&!contacted.has(c.id)&&!needsLinkedinMessageReview(c)&&!exportedLinkedinInvitation(c)&&linkedinProfile(c)!==null&&!pulledForwardToday(c,today)&&Boolean(companyKey(c))&&!badCompany(c.company)&&
  !contacts.some(x=>x.id!==c.id&&companyKey(x)===companyKey(c)&&(x.status!=='New'||x.next_date!==null));
 const future=sortFollowUps(contacts.filter(c=>valid(c)&&c.next_date!==null&&c.next_date>today));
 const date=future[0]?.next_date??null;
 const scheduled=date?future.filter(c=>c.next_date===date):[];
 const unscheduled=sortFollowUps(contacts.filter(c=>valid(c)&&c.next_date===null&&
  c.priority!=='Low'&&c.name.trim()&&c.title.trim()&&c.notes.trim()&&
  !blocked.has(companyKey(c)))).sort((a,b)=>Number(draftFor(b,activities).ready)-Number(draftFor(a,activities).ready));
 const companies=new Set<string>();
 const profiles=new Set<string>();
 const unique=(rows:Contact[])=>rows.filter(c=>{
   const company=companyKey(c),profile=linkedinKey(c);
   if(!profile||companies.has(company)||profiles.has(profile))return false;
   companies.add(company);profiles.add(profile);return true;
 });
 const scheduledUnique=unique(scheduled);
 const unscheduledUnique=unique(unscheduled);
 const readyBuffer=unscheduledUnique.filter(c=>draftFor(c,activities).ready).length;
 return {date,items:[...scheduledUnique,...unscheduledUnique],scheduledCount:scheduledUnique.length,unscheduledCount:unscheduledUnique.length,readyBuffer,
  pool:{unscheduled:unscheduledAll.length,withProfile:unscheduledWithProfile.length,
   withoutProfile:unscheduledAll.length-unscheduledWithProfile.length,blockedByCompany,pendingHistoryReview,pendingInvitations}};
}
/** Assign extra outbounds only when a current, stage-matched, conversation-safe draft exists. */
export function readyOutboundCandidates(contacts:Contact[],activities:Activity[],today=dateKey()){
 return nextOutboundBatch(contacts,activities,today).items.filter(c=>draftFor(c,activities).ready);
}

export function dailyQueue(contacts:Contact[],activities:Activity[],today=dateKey()){
 const due=contacts.filter(c=>!inactive(c)&&c.status!=='Nurture'&&c.next_date&&c.next_date<=today);
 const dueFollow=sortFollowUps(due.filter(c=>c.status!=='New'&&c.status!=='Meeting booked'));
 // A pending invitation is a check-in, not a warm DM. Keep it visible, but never
 // allow it to consume a message-ready follow-up slot.
 const pending=dueFollow.filter(c=>{
  const h=contactHistory(c,activities);
  return h.find(a=>outbound.includes(a.kind)||replies.includes(a.kind))?.kind==='Connection request sent'&&!verifiedLinkedinConnection(c);
 });
 const pendingIds=new Set(pending.map(c=>c.id));
 const followCandidates=dueFollow.filter(c=>!pendingIds.has(c.id));
 const follow=[...followCandidates.filter(c=>draftFor(c,activities).ready),...followCandidates.filter(c=>!draftFor(c,activities).ready)];
 const firstDue=sortFollowUps(due.filter(c=>c.status==='New'&&linkedinProfile(c)!==null));
 const first=[...firstDue.filter(c=>draftFor(c,activities).ready),...firstDue.filter(c=>!draftFor(c,activities).ready)];
 const pulled=first.filter(c=>pulledForwardToday(c,today));
 const normal=first.filter(c=>!pulledForwardToday(c,today));
 const extraNew=contacts.filter(c=>pulledForwardToday(c,today)).length;
 const newLimit=NEW_LIMIT+extraNew;
 const sentToday=activities.filter(a=>outbound.includes(a.kind)&&actualLinkedinActionDay(a)===today);
 const newToday=new Set(sentToday.filter(a=>a.kind==='First outreach sent'||a.kind==='Connection request sent').map(a=>a.contact_id)).size;
 const followToday=new Set(sentToday.filter(a=>a.kind==='Follow-up sent').map(a=>a.contact_id)).size;
 const remaining=Math.max(0,newLimit-newToday);
 // Retain the ordinary queue order; reserve space for pulled prospects even with a large overdue backlog.
 const normalSlots=Math.max(0,remaining-pulled.length);
 return {follow:follow.slice(0,Math.max(0,FOLLOW_LIMIT-followToday)),pending:pending.slice(0,8),pendingTotal:pending.length,first:[...normal.slice(0,normalSlots),...pulled].slice(0,remaining),followTotal:follow.length,firstTotal:first.length,newToday,followToday,newLimit,extraNew};
}
