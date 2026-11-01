import fs from 'fs';
const dir = process.argv[2];
function parseCSV(t){const rows=[];let row=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c=='"'){if(t[i+1]=='"'){f+='"';i++;}else q=false;}else f+=c;}else{if(c=='"')q=true;else if(c==','){row.push(f);f='';}else if(c=='\n'){row.push(f);rows.push(row);row=[];f='';}else if(c!='\r')f+=c;}}if(f||row.length){row.push(f);rows.push(row);}const h=rows.shift();return rows.map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]])));}
const soc=parseCSV(fs.readFileSync(dir+'/societies.csv','utf8'));
const data=parseCSV(fs.readFileSync(dir+'/data.csv','utf8'));
const S={};for(const s of soc)S[s.ID]={lat:+s.Latitude,lon:+s.Longitude,name:s.Name,region:s.region};
for(const d of data){if(!S[d.Soc_ID])continue;S[d.Soc_ID][d.Var_ID]=d.Code_ID?d.Code_ID.split("-")[1]:d.Value;}
const bands=[[0,10],[10,20],[20,30],[30,40],[40,50],[50,60],[60,70],[70,90]];
console.log('absLat  n  hunt%  gath%  fish%  | dominant H/G/F | sedentary% | median density /100km2');
for(const [a,b] of bands){const g=Object.values(S).filter(s=>Math.abs(s.lat)>=a&&Math.abs(s.lat)<b&&(s.B005=='1'||s.B005=='2'));
 const m=k=>(g.reduce((x,s)=>x+(+s[k]||0),0)/g.length).toFixed(0);
 const dom=[1,2,3].map(c=>g.filter(s=>s.B004==String(c)).length);
 const sed=g.filter(s=>s.B009=='2').length/g.filter(s=>s.B009).length*100;
 const den=g.map(s=>+s.B008).filter(x=>x>0).sort((x,y)=>x-y);const med=den[Math.floor(den.length/2)]*100;
 console.log(`${a}-${b}`.padEnd(7),String(g.length).padStart(3),m('B001').padStart(6),m('B002').padStart(6),m('B003').padStart(6),' |',dom.join('/').padStart(10),' |',sed.toFixed(0).padStart(5),' |',med?.toFixed(1));}
// sedentism by dominant activity
console.log('\nsedentary share & median density by dominant activity (normal groups):');
for(const [c,n] of [[1,'hunt'],[2,'gath'],[3,'fish']]){const g=Object.values(S).filter(s=>s.B004==String(c)&&(s.B005=='1'||s.B005=='2'));const sed=g.filter(s=>s.B009=='2').length;const den=g.map(s=>+s.B008).filter(x=>x>0).sort((x,y)=>x-y);console.log(n,g.length,'sedentary',sed,'('+(sed/g.length*100).toFixed(0)+'%)','median density/100km2',(den[Math.floor(den.length/2)]*100).toFixed(1));}
// list sedentary groups
const sedg=Object.values(S).filter(s=>s.B009=='2'&&(s.B005=='1'||s.B005=='2'));
console.log('\nsedentary normal groups by region:');const R={};for(const s of sedg){R[s.region]=(R[s.region]||0)+1;}console.log(R);
console.log('total normal', Object.values(S).filter(s=>(s.B005=='1'||s.B005=='2')).length, 'suspect', Object.values(S).filter(s=>s.B005=='2').length);
