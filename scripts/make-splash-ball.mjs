import sharp from 'sharp';
const S=256, R=118, c=128;
let d='';
// dimples on a sphere projection
for (let lat=-80; lat<=80; lat+=13) for (let lon=-90; lon<=90; lon+= 13/Math.max(0.3,Math.cos(lat*Math.PI/180))) {
  const la=lat*Math.PI/180, lo=lon*Math.PI/180;
  const x=Math.cos(la)*Math.sin(lo), y=Math.sin(la), z=Math.cos(la)*Math.cos(lo);
  if (z<0.15) continue;
  const r=7.5*Math.sqrt(z);
  d+=`<ellipse cx="${(c+x*R).toFixed(1)}" cy="${(c-y*R).toFixed(1)}" rx="${(r*Math.sqrt(1-x*x)).toFixed(2)}" ry="${(r*Math.sqrt(1-y*y)).toFixed(2)}" fill="url(#dim)" opacity="${(0.35+0.4*z).toFixed(2)}"/>`;
}
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">
<defs>
<radialGradient id="b" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#ffffff"/><stop offset="0.55" stop-color="#eef0f2"/><stop offset="0.85" stop-color="#b9c0c8"/><stop offset="1" stop-color="#7c858f"/></radialGradient>
<radialGradient id="dim" cx="60%" cy="65%" r="70%"><stop offset="0" stop-color="#ffffff" stop-opacity="0.9"/><stop offset="1" stop-color="#8a939c" stop-opacity="0.9"/></radialGradient>
<radialGradient id="hi" cx="35%" cy="28%" r="30%"><stop offset="0" stop-color="#fff" stop-opacity="0.9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<clipPath id="cl"><circle cx="${c}" cy="${c}" r="${R}"/></clipPath>
</defs>
<circle cx="${c}" cy="${c+4}" r="${R}" fill="#000" opacity="0.25"/>
<circle cx="${c}" cy="${c}" r="${R}" fill="url(#b)"/>
<g clip-path="url(#cl)">${d}</g>
<circle cx="${c}" cy="${c}" r="${R}" fill="url(#hi)"/>
</svg>`;
await sharp(Buffer.from(svg)).png({compressionLevel:9}).toFile(process.argv[2]);
