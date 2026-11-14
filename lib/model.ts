export const statuses = ['New','Contacted','Replied','Interested','Meeting booked','Nurture','Not interested','Do not contact','Converted'] as const;
export const stages = ['Qualified','Discovery','Demo / Scoping','Proposal sent','Pilot / Negotiation','Closed won','Closed lost'] as const;
export const types = ['Direct customer','Consultant','Partner'] as const;
export const priorities = ['High','Medium','Low'] as const;
export type Contact = {id:string; workspace_id:string; name:string; company:string; title:string; email:string; phone:string; linkedin:string; country:string; timezone:string; industry:string; type:string; source:string; status:string; priority:string; next_date:string|null; next_action:string; pain:string; notes:string; owner:string; created_at:string};
export type Activity = {id:string; workspace_id:string; contact_id:string; kind:string; channel:string; notes:string; created_at:string};
export type Deal = {id:string; workspace_id:string; contact_id:string|null; name:string; type:string; stage:string; value:number; currency:string; close_date:string|null; notes:string; created_at:string};
export type Company = {id:string; workspace_id:string; name:string; website:string; country:string; industry:string; notes:string};
export const blank = {name:'',company:'',title:'',email:'',phone:'',linkedin:'',country:'',timezone:'',industry:'',type:'Direct customer',source:'',status:'New',priority:'Medium',next_date:null as string|null,next_action:'',pain:'',notes:'',owner:''};
export const inactive = (c:Pick<Contact,'status'>) => ['Not interested','Do not contact','Converted'].includes(c.status);
export function dateKey(d=new Date()){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
export function businessDays(n:number,start=new Date()){const d=new Date(start);while(n>0){d.setDate(d.getDate()+1);if(d.getDay()!==0&&d.getDay()!==6)n--;}return dateKey(d)}
export function actionDate(kind:string){return businessDays(kind==='Positive reply'||kind==='Meeting completed'?1:kind==='Follow-up sent'?4:3)}
export function bucket(c:Contact,today=dateKey()){if(inactive(c))return 'inactive';if(c.next_date&&c.next_date<today)return 'overdue';if(c.next_date===today)return 'today';if(c.status==='New'&&!c.next_date)return 'new';if(!c.next_date)return 'missing';return 'upcoming'}
export function normalizeLinkedin(s:string){return s.trim().toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').split(/[?#]/)[0].replace(/\/$/,'')}
export function duplicate(a:Partial<Contact>,b:Partial<Contact>){return Boolean((a.email&&b.email&&a.email.trim().toLowerCase()===b.email.trim().toLowerCase())||(a.linkedin&&b.linkedin&&normalizeLinkedin(a.linkedin)===normalizeLinkedin(b.linkedin))||(a.phone&&b.phone&&a.phone.replace(/\D/g,'').length>=7&&a.phone.replace(/\D/g,'')===b.phone.replace(/\D/g,''))||(a.name&&a.company&&b.name&&b.company&&a.name.trim().toLowerCase()===b.name.trim().toLowerCase()&&a.company.trim().toLowerCase()===b.company.trim().toLowerCase()))}
const aliases:Record<string,string>={'full name':'name','contact name':'name','name':'name','first name':'first','last name':'last','company name':'company','organization':'company','company':'company','job title':'title','designation':'title','title':'title','position':'title','email address':'email','work email':'email','email':'email','phone number':'phone','mobile':'phone','phone':'phone','linkedin url':'linkedin','linkedin profile':'linkedin','person linkedin url':'linkedin','linkedin':'linkedin','country':'country','timezone':'timezone','industry':'industry','source':'source','lead source':'source','notes':'notes','type':'type','priority':'priority'};
export function mapRow(row:Record<string,unknown>){const out:Record<string,string>={};for(const [key,value] of Object.entries(row)){const mapped=aliases[key.trim().toLowerCase().replace(/[_-]/g,' ')];if(mapped&&value!=null)out[mapped]=String(value).trim()} if(!out.name)out.name=[out.first,out.last].filter(Boolean).join(' ');delete out.first;delete out.last;return {...blank,...out,name:out.name||out.email||out.linkedin||out.phone||''};}
export function parseLoose(text:string){const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);const email=lines.find(x=>/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(x))||'';const linkedin=lines.find(x=>/linkedin\.com\/in\//i.test(x))||'';const job=lines.find(x=>/ at /i.test(x));const parts=job?.split(/ at /i)||[];return {...blank,name:lines.find(x=>x!==email&&x!==linkedin&&x!==job)||email||linkedin,title:parts[0]||'',company:parts.slice(1).join(' at '),email,linkedin,notes:text};}
export function safeLink(value:string){try{const url=new URL(value.startsWith('http')?value:'https://'+value);return ['https:','http:'].includes(url.protocol)?url.href:null}catch{return null}}

/** Calendar-day window for scheduled follow-ups (not business days). */
export function calendarDays(n:number,start=new Date()){const d=new Date(start);d.setDate(d.getDate()+n);return dateKey(d)}
export function sortFollowUps(list:Contact[]){return [...list].sort((a,b)=>(a.next_date||'').localeCompare(b.next_date||'')||priorities.indexOf(a.priority as typeof priorities[number])-priorities.indexOf(b.priority as typeof priorities[number])||a.name.localeCompare(b.name))}
export function upcomingGroups(contacts:Contact[],today:string,end:string|null){
 const groups:Record<string,Contact[]>={};
 for(const c of sortFollowUps(contacts.filter(c=>bucket(c,today)==='upcoming'&&(!end||c.next_date!<=end)))){const day=c.next_date!;(groups[day]??=[]).push(c)}
 return Object.entries(groups).map(([date,items])=>({date,items}));
}
