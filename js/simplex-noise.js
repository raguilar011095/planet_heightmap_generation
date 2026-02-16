// Simplex Noise 3D with fBm and ridged fBm variants.

import { makeRng } from './rng.js';

export class SimplexNoise {
    constructor(seed = 0) {
        this.G = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
        const rng = makeRng(seed);
        const p = new Uint8Array(256);
        for (let i = 0; i < 256; i++) p[i] = i;
        for (let i = 255; i > 0; i--) { const j = Math.floor(rng()*(i+1)); [p[i],p[j]]=[p[j],p[i]]; }
        this.perm = new Uint8Array(512);
        this.pm12 = new Uint8Array(512);
        for (let i = 0; i < 512; i++) { this.perm[i] = p[i&255]; this.pm12[i] = this.perm[i]%12; }
    }

    noise3D(x,y,z) {
        const F=1/3,H=1/6,s=(x+y+z)*F;
        const i=Math.floor(x+s),j=Math.floor(y+s),k=Math.floor(z+s);
        const t=(i+j+k)*H,x0=x-i+t,y0=y-j+t,z0=z-k+t;
        let i1,j1,k1,i2,j2,k2;
        if(x0>=y0){if(y0>=z0){i1=1;j1=0;k1=0;i2=1;j2=1;k2=0;}else if(x0>=z0){i1=1;j1=0;k1=0;i2=1;j2=0;k2=1;}else{i1=0;j1=0;k1=1;i2=1;j2=0;k2=1;}}
        else{if(y0<z0){i1=0;j1=0;k1=1;i2=0;j2=1;k2=1;}else if(x0<z0){i1=0;j1=1;k1=0;i2=0;j2=1;k2=1;}else{i1=0;j1=1;k1=0;i2=1;j2=1;k2=0;}}
        const x1=x0-i1+H,y1=y0-j1+H,z1=z0-k1+H,x2=x0-i2+2*H,y2=y0-j2+2*H,z2=z0-k2+2*H,x3=x0-1+3*H,y3=y0-1+3*H,z3=z0-1+3*H;
        const ii=i&255,jj=j&255,kk=k&255,{perm:P,pm12:M,G:g}=this;
        let n0=0,n1=0,n2=0,n3=0;
        let a=0.6-x0*x0-y0*y0-z0*z0;if(a>0){a*=a;const v=g[M[ii+P[jj+P[kk]]]];n0=a*a*(v[0]*x0+v[1]*y0+v[2]*z0);}
        let b=0.6-x1*x1-y1*y1-z1*z1;if(b>0){b*=b;const v=g[M[ii+i1+P[jj+j1+P[kk+k1]]]];n1=b*b*(v[0]*x1+v[1]*y1+v[2]*z1);}
        let c=0.6-x2*x2-y2*y2-z2*z2;if(c>0){c*=c;const v=g[M[ii+i2+P[jj+j2+P[kk+k2]]]];n2=c*c*(v[0]*x2+v[1]*y2+v[2]*z2);}
        let d=0.6-x3*x3-y3*y3-z3*z3;if(d>0){d*=d;const v=g[M[ii+1+P[jj+1+P[kk+1]]]];n3=d*d*(v[0]*x3+v[1]*y3+v[2]*z3);}
        return 32*(n0+n1+n2+n3);
    }

    fbm(x,y,z,octaves=5,persistence=2/3) {
        let sum=0,max=0,amp=1;
        for(let o=0;o<octaves;o++){const f=1<<o;sum+=amp*this.noise3D(x*f,y*f,z*f);max+=amp;amp*=persistence;}
        return sum/max;
    }

    ridgedFbm(x, y, z, octaves = 6, lacunarity = 2.0, gain = 0.5, offset = 1.0) {
        let sum = 0, freq = 1, amp = 1, prev = 1, maxVal = 0;
        for (let o = 0; o < octaves; o++) {
            let n = this.noise3D(x * freq, y * freq, z * freq);
            n = offset - Math.abs(n);
            n = n * n;
            sum += n * amp * prev;
            maxVal += amp;
            prev = Math.min(n, 1);
            freq *= lacunarity;
            amp *= gain;
        }
        return sum / maxVal;
    }
}
