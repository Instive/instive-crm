import {test} from 'node:test';import assert from 'node:assert/strict';import {businessDays,duplicate,mapRow,parseLoose,bucket,blank,calendarDays,upcomingGroups,sortFollowUps} from '../lib/model.ts';
test('business days skip weekend',()=>assert.equal(businessDays(1,new Date(2026,10,13,12)),'2026-11-16'));
test('duplicate email and LinkedIn normalization',()=>{assert(duplicate({email:' A@EXAMPLE.COM '},{email:'a@example.com'}));assert(duplicate({linkedin:'https://www.linkedin.com/in/a/'},{linkedin:'linkedin.com/in/a?x=1'}));assert(!duplicate({name:'Alex'},{name:'Alex'}))});
test('maps spreadsheet aliases',()=>assert.equal(mapRow({'First Name':'Alex','Last Name':'Smith','Company Name':'Freight'}).name,'Alex Smith'));
test('plain text parser',()=>assert.equal(parseLoose('John Smith\nVP at Freight\na@example.com').company,'Freight'));
test('opt out excluded',()=>assert.equal(bucket({...blank,id:'1',workspace_id:'1',created_at:'',status:'Do not contact',next_date:'2020-01-01'}),'inactive'));

const scheduled=(name:string,next_date:string|null,priority='Medium',status='Contacted')=>({...blank,id:name,workspace_id:'w',created_at:'',name,next_date,priority,status});
test('upcoming groups sort by date then priority and exclude inactive, due and unscheduled',()=>{
 const rows=[scheduled('Late','2026-11-20','High'),scheduled('Normal','2026-11-16'),scheduled('Urgent','2026-11-16','High'),scheduled('Opt out','2026-11-16','High','Do not contact'),scheduled('Converted','2026-11-18','High','Converted'),scheduled('Today','2026-11-14'),scheduled('Past','2026-11-13'),scheduled('Unscheduled',null),scheduled('Beyond','2026-12-01')];
 const grouped=upcomingGroups(rows,'2026-11-14','2026-11-21');
 assert.deepEqual(grouped.map(g=>[g.date,g.items.map(c=>c.name)]),[['2026-11-16',['Urgent','Normal']],['2026-11-20',['Late']]]);
 assert.equal(upcomingGroups(rows,'2026-11-14',null).length,3);
 assert.equal(rows[0].name,'Late');
});
test('calendar window includes weekend and crosses month boundary',()=>assert.equal(calendarDays(7,new Date(2026,10,27,12)),'2026-12-04'));
test('scheduled new contact is upcoming, not an unscheduled new prospect',()=>assert.equal(bucket(scheduled('New','2026-11-16','High','New'),'2026-11-14'),'upcoming'));
test('follow-ups sort earliest first then highest priority',()=>assert.deepEqual(sortFollowUps([scheduled('B','2026-11-16','Medium'),scheduled('C','2026-11-17','High'),scheduled('A','2026-11-16','High')]).map(c=>c.name),['A','B','C']));
