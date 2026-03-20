package api

import "net/http"

// serveDashboard serves the embedded admin dashboard HTML page.
func serveDashboard(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write([]byte(dashboardHTML))
}

const dashboardHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>QoreBridge Indexer</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0a0a0f;color:#e0e0e0;padding:20px}
h1{font-size:1.4rem;color:#fff;margin-bottom:4px}
.subtitle{color:#888;font-size:.85rem;margin-bottom:20px}
.controls{display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center}
input{background:#1a1a2e;border:1px solid #333;color:#fff;padding:8px 12px;border-radius:8px;font-size:.85rem;outline:none}
input:focus{border-color:#6366f1}
button{background:#6366f1;color:#fff;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:.85rem}
button:hover{background:#5558e6}
.stats{display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap}
.stat{background:#1a1a2e;border:1px solid #222;border-radius:10px;padding:12px 16px;min-width:120px}
.stat-val{font-size:1.3rem;font-weight:700;color:#fff}
.stat-label{font-size:.75rem;color:#888;margin-top:2px}
table{width:100%;border-collapse:collapse;font-size:.82rem}
th{text-align:left;padding:8px 10px;color:#888;font-weight:500;border-bottom:1px solid #222;white-space:nowrap}
td{padding:8px 10px;border-bottom:1px solid #1a1a2e;vertical-align:top}
tr:hover td{background:#12121f}
.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:.75rem;font-weight:600}
.badge-done{background:#064e3b;color:#34d399}
.badge-pending{background:#422006;color:#fbbf24}
.badge-failed{background:#450a0a;color:#f87171}
.mono{font-family:"SF Mono",Monaco,Consolas,monospace;font-size:.78rem}
.truncate{max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;vertical-align:bottom}
a{color:#818cf8;text-decoration:none}
a:hover{text-decoration:underline}
.empty{text-align:center;padding:40px;color:#555}
.refresh-info{color:#555;font-size:.75rem;margin-left:auto}
</style>
</head>
<body>
<h1>QoreBridge Indexer</h1>
<p class="subtitle">Admin dashboard — bridge event explorer</p>

<div class="stats" id="stats">
  <div class="stat"><div class="stat-val" id="s-total">-</div><div class="stat-label">Total Events</div></div>
  <div class="stat"><div class="stat-val" id="s-done">-</div><div class="stat-label">Done</div></div>
  <div class="stat"><div class="stat-val" id="s-pending">-</div><div class="stat-label">Pending</div></div>
  <div class="stat"><div class="stat-val" id="s-failed">-</div><div class="stat-label">Failed</div></div>
</div>

<div class="controls">
  <input id="search" type="text" placeholder="Search by wallet address or tx hash..." style="flex:1;min-width:240px">
  <button onclick="doSearch()">Search</button>
  <button onclick="loadAll()" style="background:#333">Show All</button>
  <span class="refresh-info" id="refresh-info"></span>
</div>

<div style="overflow-x:auto">
<table>
<thead><tr>
  <th>#</th><th>Status</th><th>Provider</th><th>Tx Hash</th>
  <th>Sender</th><th>Amount</th><th>Platform Fee</th><th>Bridge Fee</th><th>Received</th>
  <th>Source</th><th>Dest</th><th>Time</th>
</tr></thead>
<tbody id="tbody"></tbody>
</table>
</div>
<div class="empty" id="empty" style="display:none">No events found</div>

<script>
const API = window.location.origin;
const CHAINS = {1:"Ethereum",11155111:"Sepolia",42161:"Arbitrum",421614:"Arb Sepolia",8453:"Base",84532:"Base Sepolia",10:"Optimism",137:"Polygon",43114:"Avalanche",56:"BSC"};
const ETHERSCAN = {1:"etherscan.io",11155111:"sepolia.etherscan.io",42161:"arbiscan.io",8453:"basescan.org",10:"optimistic.etherscan.io",137:"polygonscan.com",43114:"snowscan.xyz"};

function badge(s){
  const c = s==="done"?"done":s==="pending"?"pending":"failed";
  return '<span class="badge badge-'+c+'">'+s+'</span>';
}
function chainName(id){return CHAINS[id]||("Chain "+id)}
function txLink(hash,chainId){
  const d = ETHERSCAN[chainId];
  if(!d) return '<span class="mono truncate" title="'+hash+'">'+hash.slice(0,10)+'…</span>';
  return '<a href="https://'+d+'/tx/'+hash+'" target="_blank" class="mono truncate" title="'+hash+'">'+hash.slice(0,10)+'…</a>';
}
function addrLink(addr,chainId){
  const d = ETHERSCAN[chainId];
  if(!d) return '<span class="mono truncate" title="'+addr+'">'+addr.slice(0,8)+'…</span>';
  return '<a href="https://'+d+'/address/'+addr+'" target="_blank" class="mono truncate" title="'+addr+'">'+addr.slice(0,8)+'…</a>';
}
function fmtAmount(raw){return (Number(raw)/1e6).toFixed(4)}
function fmtTime(ts){return new Date(ts*1000).toLocaleString()}

function render(events){
  const tb = document.getElementById("tbody");
  const em = document.getElementById("empty");
  if(!events||events.length===0){tb.innerHTML="";em.style.display="block";updateStats([]);return}
  em.style.display="none";
  updateStats(events);
  tb.innerHTML = events.map(e =>
    '<tr>'+
    '<td>'+e.nonce+'</td>'+
    '<td>'+badge(e.status)+'</td>'+
    '<td>'+e.provider+'</td>'+
    '<td>'+txLink(e.txHash,e.chainId)+'</td>'+
    '<td>'+addrLink(e.sender,e.chainId)+'</td>'+
    '<td>'+fmtAmount(e.amount)+'</td>'+
    '<td>'+fmtAmount(e.platformFee)+'</td>'+
    '<td>'+(e.receivedAmount ? fmtAmount(String(Number(e.amount)-Number(e.platformFee)-Number(e.receivedAmount))) : '-')+'</td>'+
    '<td>'+(e.receivedAmount ? fmtAmount(e.receivedAmount) : fmtAmount(String(Number(e.amount)-Number(e.platformFee))))+'</td>'+
    '<td>'+chainName(e.sourceChainId)+'</td>'+
    '<td>'+chainName(e.destinationChainId)+'</td>'+
    '<td style="white-space:nowrap">'+fmtTime(e.timestamp)+'</td>'+
    '</tr>'
  ).join("");
}
function updateStats(events){
  document.getElementById("s-total").textContent=events.length;
  document.getElementById("s-done").textContent=events.filter(e=>e.status==="done").length;
  document.getElementById("s-pending").textContent=events.filter(e=>e.status==="pending").length;
  document.getElementById("s-failed").textContent=events.filter(e=>e.status==="failed").length;
}
async function loadAll(){
  document.getElementById("search").value="";
  const r = await fetch(API+"/api/history?limit=200");
  const d = await r.json();
  render(d);
  document.getElementById("refresh-info").textContent="Updated "+new Date().toLocaleTimeString();
}
async function doSearch(){
  const q = document.getElementById("search").value.trim();
  if(!q){loadAll();return}
  let url;
  if(q.length===66 && q.startsWith("0x")){url=API+"/api/history/"+q}
  else{url=API+"/api/history?address="+q+"&limit=200"}
  const r = await fetch(url);
  const d = await r.json();
  render(Array.isArray(d)?d:d?[d]:[]);
}
document.getElementById("search").addEventListener("keydown",e=>{if(e.key==="Enter")doSearch()});
loadAll();
setInterval(loadAll,15000);
</script>
</body>
</html>`
