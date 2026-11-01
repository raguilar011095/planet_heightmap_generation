import math
C = {
 'FertileCrescent': (36.5, 40.0),
 'NorthChina': (35.5, 112.0),
 'Yangtze': (30.0, 116.0),
 'Mesoamerica': (18.0, -99.5),
 'EasternNA': (37.0, -87.0),
 'CentralAndes': (-13.0, -72.0),
 'SWAmazonia': (-12.0, -64.0),
 'NewGuinea': (-5.8, 144.3),
 'WestSahel': (16.0, -2.0),
 'EastSahelSudan': (15.0, 34.0),
 'Ethiopia': (9.0, 39.0),
 'Ganges': (25.5, 82.0),
 'SouthIndia': (15.0, 77.0),
 'WAfricaForest': (8.0, 4.0),
}
def d(a,b):
    la1,lo1=map(math.radians,a); la2,lo2=map(math.radians,b)
    h=math.sin((la2-la1)/2)**2+math.cos(la1)*math.cos(la2)*math.sin((lo2-lo1)/2)**2
    return 2*6371*math.asin(math.sqrt(h))
names=list(C)
nn=[]
for n in names:
    ds=sorted((d(C[n],C[m]),m) for m in names if m!=n)
    nn.append(ds[0][0])
    print(f"{n:16s} nearest {ds[0][1]:16s} {ds[0][0]:6.0f} km; 2nd {ds[1][1]:16s} {ds[1][0]:6.0f} km")
nn.sort()
print('median NN', nn[len(nn)//2], 'min', nn[0], 'max', nn[-1], 'mean', sum(nn)/len(nn))
# Larson 11 core subset
core=['FertileCrescent','NorthChina','Yangtze','Mesoamerica','EasternNA','CentralAndes','SWAmazonia','NewGuinea','WestSahel','Ganges','Ethiopia']
nn2=[]
for n in core:
    ds=sorted((d(C[n],C[m]),m) for m in core if m!=n); nn2.append(ds[0][0])
nn2.sort(); print('core11 NN sorted', [round(x) for x in nn2])
# land area of Earth ice-free ~ 134e6 km2 (approx 130M excluding Antarctica? 149M total)
A=134e6
for k in (11,14,24):
    print(k,'centres -> area per centre',A/k,'km2; equiv spacing (sqrt)',math.sqrt(A/k),'km')
