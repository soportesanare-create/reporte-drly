const $=s=>document.querySelector(s);
const tbody=$("#tbody"); 
const q=$("#q"), fd=$("#fd"), td=$("#td"), reset=$("#reset");
const chips=$("#chips"); 
const pageSizeSel=$("#pageSize"); const prev=$("#prev"); const next=$("#next"); const pageInfo=$("#pageInfo");
const btnCsvView=$("#csvView"); const btnCsvAll=$("#csvAll"); const btnLoadAll=$("#loadAll"); const btnCsvDetail=$("#csvDetail"); const selKAM=$("#kamFilter");

let raw=[], filtered=[], pageRows=[], page=1, pageSize=25, currentStatus="Todos";
let historicalLoaded=false;

const ready = new Promise(resolve=>{
  try{
    if(firebase?.auth){
      firebase.auth().onAuthStateChanged(u=>{ if(u) resolve(); });
      if(!firebase.auth().currentUser) firebase.auth().signInAnonymously().catch(console.error);
    } else resolve();
  }catch(e){ console.error(e); resolve(); }
});

ready.then(()=>startListener());

function startListener(){
  tryStart(true).catch(()=>tryStart(false));
}
function tryStart(useOrder){
  return new Promise((resolve,reject)=>{
    let ref = db.collection("cotizaciones");
    if(useOrder) ref = ref.orderBy("createdAt","desc");
    const unsub = ref.onSnapshot(snap=>{
      const live=[]; snap.forEach(d=>live.push({id:d.id,...d.data()}));
      const map = new Map(raw.map(r=>[r.id,r])); live.forEach(d=>map.set(d.id,d));
      raw = Array.from(map.values());
      buildKamOptions(raw);
      applyFilters(); resolve();
    }, err=>{
      console.error("listener error:", err);
      if (useOrder && (err.code==="failed-precondition" || err.code==="invalid-argument" || err.code==="permission-denied")) reject(err);
      else tbody.innerHTML='<tr><td class="muted" colspan="15">Error: '+esc(err.message||err.code)+'</td></tr>';
    });
  });
}

// --- Histórico (batches de 500) ---
async function loadHistorical(){
  try{
    const ref = db.collection("cotizaciones");
    let orderField="createdAt", canOrder=true;
    try{ await ref.orderBy(orderField).limit(1).get(); }catch(e){ canOrder=false; }
    const orderBy = canOrder ? ref.orderBy(orderField) : ref.orderBy(firebase.firestore.FieldPath.documentId());
    let q = orderBy.limit(500), last=null, all=[];
    while(true){
      const snap = await q.get();
      if(snap.empty) break;
      snap.forEach(d=>all.push({id:d.id,...d.data()}));
      if(snap.size<500) break;
      last = snap.docs[snap.docs.length-1];
      q = orderBy.startAfter(last).limit(500);
    }
    const map = new Map(raw.map(r=>[r.id,r])); all.forEach(d=>map.set(d.id,d));
    raw = Array.from(map.values());
    historicalLoaded=true;
    applyFilters();
    if(btnLoadAll){ btnLoadAll.textContent="Histórico cargado"; btnLoadAll.disabled=true; }
  }catch(e){
    console.error(e); alert("No se pudo cargar el histórico: "+(e.message||e.code||e));
  }
}

function sum(arr,k){return (arr||[]).reduce((a,b)=>a+Number(b[k]||0),0);}
function toRow(d){
  const folio=d.folio||d.Folio||d.id||'';
  const paciente=d.paciente||d.Paciente||d.nombre||'';
  const telefono=d.telefono||d.tel||'';
  const kam=d.kam||d.KAM||d.vendedor||'';
  const aseguradora=d.aseguradora||'';
  const dx=d.dx||''; const esquema=d.esquema||'';
  const fechaEmision=d.fechaEmision||''; const fechaValidez=d.fechaValidez||'';
  const medicamentos=Array.isArray(d.medicamentos)?d.medicamentos:[];
  const servicios=Array.isArray(d.servicios)?d.servicios:[];
  const totM=sum(medicamentos,'subtotal')||sum(medicamentos,'total')||sum(medicamentos,'precioUnit');
  const totS=sum(servicios,'total')||sum(servicios,'subtotal')||sum(servicios,'precioUnit');
  const total=Number(d.total||totM+totS||0);
  return {id:d.id, folio, paciente, telefono, kam, aseguradora, dx, esquema, fechaEmision, fechaValidez,
    medicamentos, servicios, total, status:d.status||'En proceso', motivo:d.motivo||''};
}

function applyFilters(){
  const data = raw.map(toRow);
  const f=fd.value?new Date(fd.value+'T00:00:00'):null;
  const t=td.value?new Date(td.value+'T23:59:59'):null;
  const query=(q.value||'').toLowerCase().trim();
  filtered = data.filter(r=>{
    let ok=true;
    if((f||t) && r.fechaEmision){
      const ms=Date.parse(r.fechaEmision); if(!isNaN(ms)){ if(f && ms<+f) ok=false; if(t && ms>+t) ok=false; }
    }
    if(currentStatus!=="Todos" && (r.status||'En proceso')!==currentStatus) ok=false;
    if(query){
      const hay=[r.folio,r.paciente,r.telefono,r.kam,r.aseguradora,r.dx,r.esquema].join(' ').toLowerCase();
      if(!hay.includes(query)) ok=false;
    }
    if(selKAM && selKAM.value){ if((r.kam||'').toLowerCase()!==selKAM.value.toLowerCase()) ok=false; }
    return ok;
  });
  page=1; paginate(); render();
}

function paginate(){
  pageSize = Number(pageSizeSel?.value||25);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  if(page>totalPages) page=totalPages;
  const start=(page-1)*pageSize, end=start+pageSize;
  pageRows = filtered.slice(start, end);
  if(pageInfo) pageInfo.textContent = `${page}/${totalPages}`;
}

function render(){
  if(!pageRows.length){ tbody.innerHTML='<tr><td class="muted" colspan="15">Sin resultados.</td></tr>'; return; }
  tbody.innerHTML = pageRows.map(r=>`
    <tr data-id="${r.id}">
      <td class="nowrap">${esc(r.folio)}</td>
      <td class="nowrap">${esc(r.fechaEmision)}</td>
      <td class="nowrap">${esc(r.fechaValidez)}</td>
      <td>${esc(r.paciente)}</td>
      <td>${esc(r.telefono)}</td>
      <td>${esc(r.kam)}</td>
      <td>${esc(r.aseguradora)}</td>
      <td>${esc(r.dx)}</td>
      <td>${esc(r.esquema)}</td>
      <td>${(r.medicamentos||[]).map(m=>esc(`${m.cantidad||1}× ${m.nombre||m.codigo||''} $${fmt(m.subtotal||m.total||m.precioUnit||0)}`)).join('<br>')}</td>
      <td>${(r.servicios||[]).map(s=>esc(`${s.cantidad||1}× ${s.servicio||''} $${fmt(s.total||s.subtotal||s.precioUnit||0)}`)).join('<br>')}</td>
      <td class="align-right">$${fmt(r.total)}</td>
      <td><select class="edit" data-k="status">
            <option${r.status==='En proceso'?' selected':''}>En proceso</option>
            <option${r.status==='Aceptado'?' selected':''}>Aceptado</option>
            <option${r.status==='Cancelado'?' selected':''}>Cancelado</option>
          </select></td>
      <td><input class="edit" data-k="motivo" type="text" value="${escAttr(r.motivo)}" placeholder="Escribe motivo…"/></td>
      <td><button class="save">Guardar</button></td>
    </tr>`).join("");

  tbody.querySelectorAll("button.save").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const tr = btn.closest("tr"); const id = tr.getAttribute("data-id");
      const status = tr.querySelector('[data-k="status"]').value;
      const motivo = tr.querySelector('[data-k="motivo"]').value;
      try{
        await db.collection("cotizaciones").doc(id).set({status, motivo}, {merge:true});
        btn.textContent="✔"; setTimeout(()=>btn.textContent="Guardar",900);
      }catch(e){ console.error(e); btn.textContent="⚠"; setTimeout(()=>btn.textContent="Guardar",1200); }
    });
  });
}

// Listeners UI
[q,fd,td].forEach(el=>el?.addEventListener('input', applyFilters));
pageSizeSel?.addEventListener('change', ()=>{ paginate(); render(); });
prev?.addEventListener('click', ()=>{ page=Math.max(1,page-1); paginate(); render(); });
next?.addEventListener('click', ()=>{ page=page+1; paginate(); render(); });
chips?.addEventListener('click', e=>{
  const c=e.target.closest('.chip'); if(!c) return;
  currentStatus=c.getAttribute('data-status');
  chips.querySelectorAll('.chip').forEach(x=>x.classList.toggle('active', x===c));
  applyFilters();
});
reset?.addEventListener('click', ()=>{ q.value=''; fd.value=''; td.value=''; currentStatus='Todos'; chips.querySelectorAll('.chip').forEach((x,i)=>x.classList.toggle('active',i==0)); applyFilters(); });

btnLoadAll?.addEventListener('click', loadHistorical);


// --- Util para opciones de KAM ---
function buildKamOptions(arr){
  if(!selKAM) return;
  const set=new Set();
  (arr||[]).forEach(d=>{ const k=(d.kam||d.KAM||'').trim(); if(k) set.add(k); });
  const prevVal = selKAM.value;
  selKAM.innerHTML = '<option value="">Todos los KAM</option>' + Array.from(set).sort().map(k=>`<option>${esc(k)}</option>`).join('');
  if(prevVal) selKAM.value = prevVal;
}
selKAM?.addEventListener('change', applyFilters);

// --- CSV Detallado (una fila por cada item) ---
function buildCsvDetail(list){
  const header = ["folio","emision","validez","paciente","telefono","KAM","aseguradora","dx","esquema",
                  "tipo","codigo","nombre","cantidad","precioUnit","subtotal_o_total","totalCotizacion","status","motivo","docId"];
  const lines = [header.join(",")];
  list.forEach(r=>{
    const meds = Array.isArray(r.medicamentos)?r.medicamentos:[];
    const servs = Array.isArray(r.servicios)?r.servicios:[];
    meds.forEach(m=>{
      lines.push([r.folio,r.fechaEmision,r.fechaValidez,r.paciente,r.telefono,r.kam,r.aseguradora,r.dx,r.esquema,
                  "medicamento", m.codigo||"", m.nombre||"", m.cantidad||1, m.precioUnit||m.precio||"", (m.subtotal||m.total||""), r.total, r.status, r.motivo, r.id]
                 .map(csvEsc).join(","));
    });
    servs.forEach(s=>{
      lines.push([r.folio,r.fechaEmision,r.fechaValidez,r.paciente,r.telefono,r.kam,r.aseguradora,r.dx,r.esquema,
                  "servicio", "", s.servicio||"", s.cantidad||1, s.precioUnit||"", (s.total||s.subtotal||""), r.total, r.status, r.motivo, r.id]
                 .map(csvEsc).join(","));
    });
    if(!meds.length && !servs.length){
      lines.push([r.folio,r.fechaEmision,r.fechaValidez,r.paciente,r.telefono,r.kam,r.aseguradora,r.dx,r.esquema,
                  "sin_items", "", "", "", "", "", r.total, r.status, r.motivo, r.id]
                 .map(csvEsc).join(","));
    }
  });
  return lines.join("\n");
}
btnCsvDetail?.addEventListener('click', async ()=>{
  // usa vista filtrada; si se desea todo, cargar histórico + usar raw
  const useAll = historicalLoaded ? raw.map(toRow) : filtered.map(x=>x);
  const csv = buildCsvDetail(useAll);
  downloadCsv("cotizaciones_detallado.csv", csv);
});
// --- CSV ---
function buildCsvRows(list){
  const header=["folio","emision","validez","paciente","telefono","KAM","aseguradora","dx","esquema","total","status","motivo"];
  const lines=[header.join(",")].concat(list.map(r=>[r.folio,r.fechaEmision,r.fechaValidez,r.paciente,r.telefono,r.kam,r.aseguradora,r.dx,r.esquema,r.total,r.status,r.motivo].map(csvEsc).join(",")));
  return lines.join("\n");
}
function downloadCsv(filename, content){
  const blob=new Blob([content],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.style.display="none"; a.href=url; a.download=filename;
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
}

btnCsvView?.addEventListener('click', ()=>{
  const csv = buildCsvRows(filtered);
  downloadCsv("cotizaciones_vista.csv", csv);
});

btnCsvAll?.addEventListener('click', async ()=>{
  if(!historicalLoaded) await loadHistorical();
  const all = raw.map(toRow);
  const csv = buildCsvRows(all);
  downloadCsv("cotizaciones_todo.csv", csv);
});

function esc(s){return String(s??"").replace(/[&<>\"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));}
function escAttr(s){return String(s??"").replace(/"/g,'&quot;');}
function fmt(n){return Number(n||0).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2});}
function csvEsc(v){ const s=String(v??""); return /[\",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; }
