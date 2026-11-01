import fs from 'fs';
const root = process.argv[2];
function parseCSV(t){const rows=[];let row=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c=='"'){if(t[i+1]=='"'){f+='"';i++;}else q=false;}else f+=c;}else{if(c=='"')q=true;else if(c==','){row.push(f);f='';}else if(c=='\n'){row.push(f);rows.push(row);row=[];f='';}else if(c!='\r')f+=c;}}if(f||row.length){row.push(f);rows.push(row);}const h=rows.shift();return rows.map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]])));}
const S={};
function load(ds){for(const s of parseCSV(fs.readFileSync(`${root}/dl-${ds}/societies.csv`,'utf8')))S[s.ID]={lat:+s.Latitude,lon:+s.Longitude,name:s.Name,region:s.region,year:+s.main_focal_year};
 for(const d of parseCSV(fs.readFileSync(`${root}/dl-${ds}/data.csv`,'utf8'))){if(S[d.Soc_ID])S[d.Soc_ID][d.Var_ID]=d.Code_ID?d.Code_ID.split('-').pop():d.Value;}}
load('ea'); load('binford');
for(const ds of ['ecoclim','gmted','gshhs'])for(const d of parseCSV(fs.readFileSync(`${root}/dl-${ds}/data.csv`,'utf8'))){if(S[d.Soc_ID])S[d.Soc_ID][d.Var_ID]=+d.Value;}
for(const s of Object.values(S)){if(s.AnnualMeanTemperature===undefined)continue;const A=Math.sqrt(2*s.AnnualTemperatureVariance);s.W=s.AnnualMeanTemperature+A;s.C=s.AnnualMeanTemperature-A;s.ET=(18*s.W-10*s.C)/(s.W-s.C+8);s.P=s.MonthlyMeanPrecipitation*12/1000;}
const EA=Object.values(S).filter(s=>s.EA042!==undefined&&s.ET!==undefined);
const BI=Object.values(S).filter(s=>s.B004!==undefined&&s.ET!==undefined);
const q=(a,p)=>{a=a.filter(x=>!isNaN(x)).sort((x,y)=>x-y);return a.length?a[Math.floor(p*(a.length-1))]:NaN};
const f1=x=>isNaN(x)?'  -  ':x.toFixed(1).padStart(6);
console.log('EA societies with climate:',EA.length,' Binford:',BI.length);
// 1. Binford dominant by ET band
const etb=[[0,10],[10,11.5],[11.5,12.75],[12.75,14],[14,15.25],[15.25,17],[17,20],[20,30]];
console.log('\nBINFORD foragers by ET band: n  hunt/gath/fish dominant  | mean %gath %hunt %fish | sedentary%');
for(const [a,b] of etb){const g=BI.filter(s=>s.ET>=a&&s.ET<b);if(!g.length)continue;const c=[1,2,3].map(k=>g.filter(s=>s.B004==k).length);const m=k=>(g.reduce((x,s)=>x+(+s[k]||0),0)/g.length).toFixed(0);const sed=g.filter(s=>s.B009=='2').length/g.length*100;
 console.log(`ET ${a}-${b}`.padEnd(13),String(g.length).padStart(3),c.join('/').padStart(9),' |',m('B001').padStart(4),m('B002').padStart(4),m('B003').padStart(4),' |',sed.toFixed(0));}
// 2. EA dominant activity by ET x precip
const names={1:'gath',2:'fish',3:'hunt',4:'past',6:'extAg',7:'intAg',8:'mixed',9:'ag?'};
const pb=[[0,250],[250,500],[500,1000],[1000,1500],[1500,9999]];
console.log('\nEA042 dominant activity, rows ET band, cols annual precip mm (counts as gath/fish/hunt/past/extAg/intAg):');
for(const [a,b] of etb){let line=`ET ${a}-${b}`.padEnd(13);for(const [p0,p1] of pb){const g=EA.filter(s=>s.ET>=a&&s.ET<b&&s.P>=p0&&s.P<p1);const c=[1,2,3,4,6,7].map(k=>g.filter(s=>s.EA042==k).length);line+=` | ${c.join('/')}`.padEnd(20);}console.log(line);}
console.log('precip cols:',pb.map(x=>x.join('-')).join(' | '));
// 3. per-category environment medians
function env(label,key,map){console.log(`\n${label}: n | ET p10/p50/p90 | W(warmest) p50 | C(coldest) p10/p50/p90 | P mm p10/p50/p90 | elev p50/p90 | |lat| p50`);
 for(const [k,n] of Object.entries(map)){const g=EA.filter(s=>s[key]==k);if(!g.length)continue;const v=x=>g.map(s=>s[x]);
 console.log(n.padEnd(22),String(g.length).padStart(4),'|',f1(q(v('ET'),.1)),f1(q(v('ET'),.5)),f1(q(v('ET'),.9)),'|',f1(q(v('W'),.5)),'|',f1(q(v('C'),.1)),f1(q(v('C'),.5)),f1(q(v('C'),.9)),'|',f1(q(v('P'),.1)).slice(0)+' '+f1(q(v('P'),.5))+' '+f1(q(v('P'),.9)),'|',f1(q(v('Elevation'),.5)),f1(q(v('Elevation'),.9)),'|',f1(q(g.map(s=>Math.abs(s.lat)),.5)));}}
env('EA042 dominant activity','EA042',{1:'gathering',2:'fishing',3:'hunting',4:'pastoralism',6:'extensive agric',7:'intensive agric',8:'mixed equal'});
env('EA040 domestic animal type','EA040',{1:'none/minor',2:'pigs',3:'sheep/goats',4:'equines',5:'deer (reindeer)',6:'camelids',7:'bovines'});
env('EA029 major crop','EA029',{1:'no agriculture',3:'vegetables',4:'tree fruits',5:'roots/tubers',6:'cereals'});
env('EA028 intensity','EA028',{1:'none',2:'casual',3:'extensive/shifting',4:'horticulture',5:'intensive',6:'intensive irrigated'});
env('EA041 milking','EA041',{1:'no milking',2:'milking'});
env('EA039 plough','EA039',{1:'no plough',2:'post-contact plough',3:'aboriginal plough'});
// camelids/bovines split by region
console.log('\nEA040 by region (top):');for(const k of ['5','6','4','2']){const R={};for(const s of EA.filter(s=>s.EA040==k))R[s.region]=(R[s.region]||0)+1;console.log(k,JSON.stringify(Object.entries(R).sort((a,b)=>b[1]-a[1]).slice(0,8)));}
// crop type by region for tree/roots
for(const k of ['4','5']){const R={};for(const s of EA.filter(s=>s.EA029==k))R[s.region]=(R[s.region]||0)+1;console.log('EA029',k,JSON.stringify(Object.entries(R).sort((a,b)=>b[1]-a[1]).slice(0,8)));}
// focal years
const yrs=EA.map(s=>s.year).filter(x=>x>0);console.log('\nEA focal year p10/p50/p90',q(yrs,.1),q(yrs,.5),q(yrs,.9));
// Fishing-dominant in EA: lat & ET
// pastoral in tropics (cattle) vs tsetse: EA pastoralists in Africa by lat
const afr=EA.filter(s=>/Africa/.test(s.region));console.log('Africa n',afr.length);
for(const [a,b] of [[-35,-15],[-15,-5],[-5,5],[5,10],[10,15],[15,25],[25,40]]){const g=afr.filter(s=>s.lat>=a&&s.lat<b);const bov=g.filter(s=>s.EA040==7).length;const past=g.filter(s=>s.EA042==4).length;const milk=g.filter(s=>s.EA041==2).length;console.log(`lat ${a}..${b}`.padEnd(14),'n',g.length,'bovine-dominant',bov,'pastoral-dominant',past,'milking',milk, 'median P', f1(q(g.map(s=>s.P),.5)));}
// ---- extra tables
const share=(g,f)=>g.length?(100*g.filter(f).length/g.length).toFixed(0).padStart(3)+'%':'  - ';
console.log('\nEA by annual precip band: n | %pastoral-dominant | %no agriculture | %milking | %camelid | %bovine | %sheep/goat | %pigs');
for(const [a,b] of [[0,150],[150,300],[300,500],[500,750],[750,1000],[1000,1500],[1500,2500],[2500,9999]]){const g=EA.filter(s=>s.P>=a&&s.P<b);
 console.log(`P ${a}-${b}`.padEnd(12),String(g.length).padStart(4),share(g,s=>s.EA042==4),share(g,s=>s.EA028==1),share(g,s=>s.EA041==2),share(g,s=>s.EA040==6),share(g,s=>s.EA040==7),share(g,s=>s.EA040==3),share(g,s=>s.EA040==2));}
console.log('\nEA by ET band: n | %no agric | %cereal | %roots | %tree | %fishing-dom | %hunting-dom | %gathering-dom | %reindeer | %equine');
for(const [a,b] of etb){const g=EA.filter(s=>s.ET>=a&&s.ET<b);
 console.log(`ET ${a}-${b}`.padEnd(13),String(g.length).padStart(4),share(g,s=>s.EA028==1),share(g,s=>s.EA029==6),share(g,s=>s.EA029==5),share(g,s=>s.EA029==4),share(g,s=>s.EA042==2),share(g,s=>s.EA042==3),share(g,s=>s.EA042==1),share(g,s=>s.EA040==5),share(g,s=>s.EA040==4));}
console.log('\nDistance to coast (km) by EA042 dominant: p25/p50/p75');
for(const [k,n] of Object.entries({1:'gathering',2:'fishing',3:'hunting',4:'pastoral',6:'extAg',7:'intAg'})){const g=EA.filter(s=>s.EA042==k).map(s=>s.DistToCoast_km);console.log(n.padEnd(10),f1(q(g,.25)),f1(q(g,.5)),f1(q(g,.75)));}
console.log('Binford fishing-dominant dist coast p25/50/75:',['3'].map(k=>{const g=BI.filter(s=>s.B004==k).map(s=>s.DistToCoast_km);return [q(g,.25),q(g,.5),q(g,.75)].map(x=>x?.toFixed(0)).join('/')})[0], ' sedentary foragers:',(()=>{const g=BI.filter(s=>s.B009=='2').map(s=>s.DistToCoast_km);return [q(g,.25),q(g,.5),q(g,.75)].map(x=>x?.toFixed(0)).join('/')})());
// sedentary foragers environment
const sed=BI.filter(s=>s.B009=='2');console.log('Binford sedentary n',sed.length,'ET p10/50/90',[.1,.5,.9].map(p=>q(sed.map(s=>s.ET),p).toFixed(1)).join('/'),'fishing-dom share',share(sed,s=>s.B004==3),'density/100km2 p50',(q(sed.map(s=>+s.B008),.5)*100).toFixed(1),' vs mobile p50',(q(BI.filter(s=>s.B009=='1').map(s=>+s.B008),.5)*100).toFixed(1));
// milking by region (absent in E/SE Asia, Americas)
const R={};for(const s of EA){if(!s.EA041)continue;R[s.region]=R[s.region]||[0,0];R[s.region][s.EA041=='2'?1:0]++;}
console.log('\nMilking share by region:',Object.entries(R).filter(([k,v])=>v[0]+v[1]>=12).map(([k,v])=>`${k}:${Math.round(100*v[1]/(v[0]+v[1]))}%(${v[0]+v[1]})`).join('; '));
// Plough by region
const Rp={};for(const s of EA){if(!s.EA039)continue;Rp[s.region]=Rp[s.region]||[0,0];Rp[s.region][s.EA039=='3'?1:0]++;}
console.log('\nAboriginal plough share by region:',Object.entries(Rp).filter(([k,v])=>v[0]+v[1]>=12&&v[1]>0).map(([k,v])=>`${k}:${Math.round(100*v[1]/(v[0]+v[1]))}%`).join('; '));
// Elevation for camelids in Americas vs Africa, bovines>3000m
console.log('\nSocieties above 3000 m: ',EA.filter(s=>s.Elevation>3000).map(s=>`${s.name}(${s.region},${Math.round(s.Elevation)}m,anim=${s.EA040},crop=${s.EA029})`).join('; '));
