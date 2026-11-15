import {businessDays,dateKey,inactive,priorities,sortFollowUps,type Contact,type Activity} from './model.ts';

export const NEW_LIMIT=5;
export const FOLLOW_LIMIT=12;
const outbound=['First outreach sent','Follow-up sent','Connection request sent'];
const replies=['Reply received','Positive reply','Meeting booked','Meeting completed','Reply','Meeting'];
export function linkedinProfile(c:Contact){try{const u=new URL(c.linkedin);return u.protocol==='https:'&&['linkedin.com','www.linkedin.com'].includes(u.hostname.toLowerCase())&&u.pathname.startsWith('/in/')?u.href:null}catch{return null}}
export function firstName(c:Contact){if(/\b(llc|ltd|inc|logistics llc|surname unavailable)\b/i.test(c.name))return '';return c.name.trim().replace(/^[^\p{L}]+/u,'').split(/\s+/)[0]||''}
export function noteField(notes:string,label:string){const line=notes.split(/\r?\n/).reverse().find(l=>l.startsWith(label+':'));return line?.slice(label.length+1).trim()||''}
export function researchContext(c:Contact){return {insight:noteField(c.notes,'Research insight'),source:noteField(c.notes,'Research source'),checked:noteField(c.notes,'Research checked'),draft:noteField(c.notes,'Research outreach draft')}}
export function researchSource(value:string){try{const u=new URL(value);return u.protocol==='https:'?u.href:null}catch{return null}}
export function contactHistory(c:Contact,activities:Activity[]){return activities.filter(a=>a.contact_id===c.id).sort((a,b)=>b.created_at.localeCompare(a.created_at))}
export function unansweredFollowUps(history:Activity[]){let n=0;for(const a of history){if(replies.includes(a.kind))break;if(a.kind==='Follow-up sent')n++}return n}
export function campaignTopic(c:Contact){const campaign=noteField(c.notes,'Recommended Campaign');const context=campaign||[c.title,c.industry,c.company].join(' ');if(/carrier email|carrier.*assignment|dispatch/i.test(context))return 'carrier emails, dispatch updates and TMS assignment';if(/rate confirmation|quote|broker/i.test(context))return 'rate confirmations and load details entering the TMS';if(/POD|billing|invoice|accounts payable|finance/i.test(context))return 'POD checks and invoice processing';if(/order entry|ERP|distribution/i.test(context))return 'order emails and ERP data entry';if(/warehouse|WMS/i.test(context))return 'warehouse updates and WMS handoffs';if(/load tender|freight|transport|logistics/i.test(context))return 'load requests and TMS data entry';return 'manual handoffs between email and operational systems'}
export function opener(c:Contact){const first=firstName(c),g=first?'Hey '+first+',':'Hi,';const company=c.company.trim()?(' at '+c.company.trim()):'';return c.type!=='Direct customer'?g+' I’m building Instive AI to help logistics teams automate repetitive work around their existing systems. Given your background, curious which operational workflow you see clients struggle to automate most?':g+' I’m building Instive AI to help logistics teams cut manual work without replacing their existing systems. Curious how your team'+company+' handles '+campaignTopic(c)+' today — mostly automated, or still some manual work?'}
export function connectionNote(c:Contact){const n=firstName(c);return (n?'Hi '+n+',':'Hi,')+' I’m building Instive AI around logistics workflow automation. Would be great to connect and exchange perspectives.'}
export type Draft={text:string;kind:'initial'|'follow'|'review';guidance:string;topic:string};
export function draftFor(c:Contact,history:Activity[]):Draft{
 const topic=campaignTopic(c),g=firstName(c)?'Hey '+firstName(c)+',':'Hi,';
 if(inactive(c)||c.status==='Nurture')return {text:'',kind:'review',guidance:'Do not send outreach; this relationship is paused or closed.',topic};
 if(c.status==='Meeting booked')return {text:'',kind:'review',guidance:'Check meeting details and prepare; do not send a generic follow-up.',topic};
 if(c.status==='New')return {text:researchContext(c).draft||opener(c),kind:'initial',guidance:'Verify current profile and check LinkedIn history first. If not connected, use the connection note instead; do not assume this is a new conversation.',topic};
 const latest=history.find(a=>outbound.includes(a.kind)||replies.includes(a.kind));
 if(latest?.kind==='Connection request sent')return {text:researchContext(c).draft||opener(c),kind:'review',guidance:'Check whether the connection was accepted. If accepted and no DM was sent, you may send this opener; otherwise snooze or pause.',topic};
 const managed=history.some(a=>outbound.includes(a.kind));
 const followups=unansweredFollowUps(history);
 if(followups>=2)return {text:'',kind:'review',guidance:'Two unanswered follow-ups already logged. Pause unless there is a new reply or a clear agreed next step.',topic};
 const saved=noteField(c.notes,'Outreach draft')||researchContext(c).draft||noteField(c.notes,'Suggested LinkedIn follow-up');
 if(!managed&&saved)return {text:saved,kind:'follow',guidance:'Context-based draft. Read the latest LinkedIn thread and confirm this has not already been sent.',topic};
 if(latest&&replies.includes(latest.kind))return {text:'',kind:'review',guidance:'A reply or meeting was logged. Open the latest thread and use Record reply / Log activity to respond with context.',topic};
 if(c.status==='Contacted'||managed){return {text:followups===0?g+' just following up on my earlier note. Is '+topic+' something your team is looking to improve, or is it already covered by your current systems?':g+' I’ll close the loop for now. If reducing manual work around '+topic+' becomes relevant, happy to compare notes. Thanks!',kind:'follow',guidance:'Check the latest thread first. Do not send if they have replied, declined, or the topic is no longer relevant.',topic}}
 return {text:g+' wanted to reconnect on our earlier conversation. Is there a specific operational workflow worth exploring together, or has your focus shifted since we last spoke?',kind:'follow',guidance:'Review the last conversation and tailor the draft before sending.',topic};
}
export function nextAfterSend(c:Contact,history:Activity[],kind:string,start=new Date()){
 if(kind==='Connection request sent')return {status:c.status==='New'?'Contacted':c.status,date:businessDays(5,start),action:'LinkedIn: check connection acceptance; do not send a duplicate request'};
 if(kind==='First outreach sent')return {status:c.status==='New'?'Contacted':c.status,date:businessDays(3,start),action:'LinkedIn: check for reply; first follow-up if appropriate'};
 if(unansweredFollowUps(history)>=1)return {status:'Nurture',date:null,action:'Paused after two unanswered follow-ups; reconnect only on new signal or reply'};
 return {status:c.status==='New'?'Contacted':c.status,date:businessDays(5,start),action:'LinkedIn: check reply; final follow-up if appropriate'};
}
export function dailyQueue(contacts:Contact[],activities:Activity[],today=dateKey()){
 const due=contacts.filter(c=>!inactive(c)&&c.status!=='Nurture'&&c.next_date&&c.next_date<=today);
 const follow=sortFollowUps(due.filter(c=>c.status!=='New'&&c.status!=='Meeting booked'));
 const first=sortFollowUps(due.filter(c=>c.status==='New'&&linkedinProfile(c)!==null));
 const sentToday=activities.filter(a=>outbound.includes(a.kind)&&dateKey(new Date(a.created_at))===today);
 const newToday=new Set(sentToday.filter(a=>a.kind==='First outreach sent'||a.kind==='Connection request sent').map(a=>a.contact_id)).size;
 const followToday=new Set(sentToday.filter(a=>a.kind==='Follow-up sent').map(a=>a.contact_id)).size;
 return {follow:follow.slice(0,Math.max(0,FOLLOW_LIMIT-followToday)),first:first.slice(0,Math.max(0,NEW_LIMIT-newToday)),followTotal:follow.length,firstTotal:first.length,newToday,followToday};
}
