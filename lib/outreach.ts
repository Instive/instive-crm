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
export function canSendConnectionRequest(c:Contact,history:Activity[]){return c.status==='New'&&!inactive(c)&&!history.some(a=>outbound.includes(a.kind)||replies.includes(a.kind));}
export function connectionNote(c:Contact){return c.status==='New'&&noteField(c.notes,'Personalized basis')==='none'&&noteField(c.notes,'Personalized status')==='New'?noteField(c.notes,'Personalized connection'):''}
export type Draft={text:string;kind:'initial'|'follow'|'review';guidance:string;topic:string;ready:boolean};
const noDraft=(guidance:string,topic:string):Draft=>({text:'',kind:'review',guidance,topic,ready:false});
export function draftFor(c:Contact,history:Activity[]):Draft{
 const topic=campaignTopic(c),historyOrdered=contactHistory(c,history),tailored=personalizedContext(c,historyOrdered);
 if(inactive(c)||c.status==='Nurture')return noDraft('Outreach paused or closed. Do not send.',topic);
 if(c.status==='Meeting booked')return noDraft('Prepare for the meeting or log the next agreed step; do not send a generic follow-up.',topic);
 const latest=historyOrdered.find(a=>outbound.includes(a.kind)||replies.includes(a.kind));
 const followups=unansweredFollowUps(historyOrdered);
 if(followups>=2)return noDraft('Two unanswered follow-ups are recorded. Pause unless there is a new reply or agreed next step.',topic);
 if(c.status==='New'){
  if(latest)return noDraft('Recorded outreach already exists although the status is New. Review and correct the status before messaging.',topic);
  if(tailored.valid)return {text:tailored.draft,kind:'initial',guidance:'Research-backed initial DM. Verify the company signal, LinkedIn identity and conversation before sending.',topic,ready:true};
  const researched=researchContext(c);
  if(researched.insight&&researchSource(researched.source)&&researched.draft&&
   !historyOrdered.some(a=>outbound.includes(a.kind)))
    return {text:researched.draft,kind:'initial',guidance:'Company-specific research draft. Verify the source, current facts and previous messages first.',topic,ready:true};
  return noDraft('Needs prospect-specific research. Check the person, company, current professional signal and prior messages before drafting.',topic);
 }
 if(latest?.kind==='Connection request sent'){
  if(tailored.valid)return {text:tailored.draft,kind:'review',guidance:'CONNECTION NOT CONFIRMED. Only send this tailored first DM after checking that the request was accepted and no DM has already been sent.',topic,ready:true};
  return noDraft('Check LinkedIn connection acceptance first. Prepare a personalized first DM for this specific prospect before sending.',topic);
 }
 if(tailored.valid)return {text:tailored.draft,kind:'follow',guidance:'Context-specific draft prepared against the latest logged activity. Check the live conversation before sending.',topic,ready:true};
 if(latest&&replies.includes(latest.kind))return noDraft('A reply or meeting was logged. Review the actual conversation and prepare an individual response, not a generic follow-up.',topic);
 if(historyOrdered.some(a=>outbound.includes(a.kind)))return noDraft('Needs a NEW, researched follow-up based on the message already sent. Do not repeat an old opener or generic template.',topic);
 const saved=noteField(c.notes,'Outreach draft')||noteField(c.notes,'Suggested LinkedIn follow-up');
 if(saved)return {text:saved,kind:'follow',guidance:'Conversation-based historical draft. Verify the latest LinkedIn reply and adapt before sending.',topic,ready:true};
 return noDraft('No verified context-specific message is available. Research the prospect and prepare a tailored follow-up.',topic);
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
 const valid=(c:Contact)=>c.status==='New'&&!contacted.has(c.id)&&linkedinProfile(c)!==null&&!pulledForwardToday(c,today)&&Boolean(companyKey(c))&&!badCompany(c.company)&&
  !contacts.some(x=>x.id!==c.id&&companyKey(x)===companyKey(c)&&(x.status!=='New'||x.next_date!==null));
 const future=sortFollowUps(contacts.filter(c=>valid(c)&&c.next_date!==null&&c.next_date>today));
 const date=future[0]?.next_date??null;
 const scheduled=date?future.filter(c=>c.next_date===date):[];
 const unscheduled=sortFollowUps(contacts.filter(c=>valid(c)&&c.next_date===null&&
  c.priority!=='Low'&&c.name.trim()&&c.title.trim()&&c.notes.trim()&&
  !blocked.has(companyKey(c))));
 const companies=new Set<string>();
 const profiles=new Set<string>();
 const unique=(rows:Contact[])=>rows.filter(c=>{
   const company=companyKey(c),profile=linkedinKey(c);
   if(!profile||companies.has(company)||profiles.has(profile))return false;
   companies.add(company);profiles.add(profile);return true;
 });
 const scheduledUnique=unique(scheduled);
 const unscheduledUnique=unique(unscheduled);
 return {date,items:[...scheduledUnique,...unscheduledUnique],scheduledCount:scheduledUnique.length,unscheduledCount:unscheduledUnique.length,
  pool:{unscheduled:unscheduledAll.length,withProfile:unscheduledWithProfile.length,
   withoutProfile:unscheduledAll.length-unscheduledWithProfile.length,blockedByCompany}};
}
export function dailyQueue(contacts:Contact[],activities:Activity[],today=dateKey()){
 const due=contacts.filter(c=>!inactive(c)&&c.status!=='Nurture'&&c.next_date&&c.next_date<=today);
 const follow=sortFollowUps(due.filter(c=>c.status!=='New'&&c.status!=='Meeting booked'));
 const first=sortFollowUps(due.filter(c=>c.status==='New'&&linkedinProfile(c)!==null));
 const pulled=first.filter(c=>pulledForwardToday(c,today));
 const normal=first.filter(c=>!pulledForwardToday(c,today));
 const extraNew=contacts.filter(c=>pulledForwardToday(c,today)).length;
 const newLimit=NEW_LIMIT+extraNew;
 const sentToday=activities.filter(a=>outbound.includes(a.kind)&&dateKey(new Date(a.created_at))===today);
 const newToday=new Set(sentToday.filter(a=>a.kind==='First outreach sent'||a.kind==='Connection request sent').map(a=>a.contact_id)).size;
 const followToday=new Set(sentToday.filter(a=>a.kind==='Follow-up sent').map(a=>a.contact_id)).size;
 const remaining=Math.max(0,newLimit-newToday);
 // Retain the ordinary queue order; reserve space for pulled prospects even with a large overdue backlog.
 const normalSlots=Math.max(0,remaining-pulled.length);
 return {follow:follow.slice(0,Math.max(0,FOLLOW_LIMIT-followToday)),first:[...normal.slice(0,normalSlots),...pulled].slice(0,remaining),followTotal:follow.length,firstTotal:first.length,newToday,followToday,newLimit,extraNew};
}
