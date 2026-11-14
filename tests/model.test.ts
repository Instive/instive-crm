import {test} from 'node:test';import assert from 'node:assert/strict';import {businessDays,duplicate,mapRow,parseLoose,bucket,blank} from '../lib/model.ts';
test('business days skip weekend',()=>assert.equal(businessDays(1,new Date(2026,10,13,12)),'2026-11-16'));
test('duplicate email and LinkedIn normalization',()=>{assert(duplicate({email:' A@EXAMPLE.COM '},{email:'a@example.com'}));assert(duplicate({linkedin:'https://www.linkedin.com/in/a/'},{linkedin:'linkedin.com/in/a?x=1'}));assert(!duplicate({name:'Alex'},{name:'Alex'}))});
test('maps spreadsheet aliases',()=>assert.equal(mapRow({'First Name':'Alex','Last Name':'Smith','Company Name':'Freight'}).name,'Alex Smith'));
test('plain text parser',()=>assert.equal(parseLoose('John Smith\nVP at Freight\na@example.com').company,'Freight'));
test('opt out excluded',()=>assert.equal(bucket({...blank,id:'1',workspace_id:'1',created_at:'',status:'Do not contact',next_date:'2020-01-01'}),'inactive'));
