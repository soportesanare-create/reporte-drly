;(function(){
  const ready = new Promise(resolve=>{
    try{
      if(firebase?.auth){
        firebase.auth().onAuthStateChanged(u=>{ if(u) resolve(); });
        if(!firebase.auth().currentUser) firebase.auth().signInAnonymously().catch(console.error);
      } else {
        resolve();
      }
    }catch(e){ console.error(e); resolve(); }
  });

  function esc(s){return String(s??'').replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;','\\'':'&#39;'}[m]));}
  function escAttr(s){return String(s??'').replace(/"/g,'&quot;');}
  function fmt(n){return Number(n||0).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2});}
  function sum(arr,key){return (arr||[]).reduce((a,b)=>a+Number(b[key]||0),0);}

  function init(el){
    el.innerHTML = `<div class="cotz-toolbar">
        <input data-q type="search" placeholder="Buscar… (folio, paciente, KAM, dx, esquema)">
        <div style="flex:1"></div>
        <button data-csv>CSV</button>
      </div>
      <div class="wide-scroll">
        <table class="table-wide">
          <thead><tr>
            <th>Folio</th><th>Emisión</th><th>Validez</th><th>Paciente</th><th>Teléfono</th><th>KAM</th>
            <th>Aseguradora</th><th>Dx</th><th>Esquema</th><th>Medicamentos</th><th>Servicios</th><th style="text-align:right">Total</th>
            <th>Status</th><th>Motivo</th><th>Guardar</th>
          </tr></thead>
          <tbody data-body><tr><td colspan="15">Conectando…</td></tr></tbody>
        </table>
      </div>`;
    const body=el.querySelector('[data-body]'); const q=el.querySelector('[data-q]');

    ready.then(()=>start(body,q));
  }

  function start(body,q){
    let raw=[];
    function tryStart(useOrder){
      return new Promise((resolve,reject)=>{
        let ref = db.collection('cotizaciones'); if(useOrder) ref=ref.orderBy('createdAt','desc');
        const unsub = ref.onSnapshot(snap=>{
          raw=[]; snap.forEach(d=>raw.push({id:d.id,...d.data()})); render();
          resolve();
        }, err=>{
          console.error('widget listener error:',err);
          if(useOrder && (err.code==='failed-precondition'||err.code==='invalid-argument'||err.code==='permission-denied')) reject(err);
          else body.innerHTML='<tr><td colspan="15">Error: '+(err.message||err.code)+'</td></tr>';
        });
      });
    }
    tryStart(true).catch(()=>tryStart(false));

    function toRow(d){
      const meds=Array.isArray(d.medicamentos)?d.medicamentos:[];
      const serv=Array.isArray(d.servicios)?d.servicios:[];
      const totM=sum(meds,'subtotal')||sum(meds,'total')||sum(meds,'precioUnit');
      const totS=sum(serv,'total')||sum(serv,'subtotal')||sum(serv,'precioUnit');
      const total=Number(d.total||totM+totS||0);
      return {id:d.id, folio:d.folio||d.Folio||d.id||'', fechaEmision:d.fechaEmision||'', fechaValidez:d.fechaValidez||'',
        paciente:d.paciente||d.Paciente||d.nombre||'', telefono:d.telefono||d.tel||'', kam:d.kam||d.KAM||d.vendedor||'',
        aseguradora:d.aseguradora||'', dx:d.dx||'', esquema:d.esquema||'',
        medicamentos:meds, servicios:serv, total, status:d.status||'En proceso', motivo:d.motivo||''};
    }
    function render(){
      const rows = (raw||[]).map(toRow);
      if(!rows.length){ body.innerHTML='<tr><td colspan="15">Sin resultados.</td></tr>'; return; }
      body.innerHTML = rows.map(r=>`
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
          <td>${(r.medicamentos||[]).map(m=>esc(`${m.cantidad||1}× ${m.nombre||m.codigo||''} $${(m.subtotal||m.total||m.precioUnit||0).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})}`)).join('<br>')}</td>
          <td>${(r.servicios||[]).map(s=>esc(`${s.cantidad||1}× ${s.servicio||''} $${(s.total||s.subtotal||s.precioUnit||0).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})}`)).join('<br>')}</td>
          <td style="text-align:right">$${(r.total||0).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
          <td><select class="edit" data-k="status">
              <option${r.status==='En proceso'?' selected':''}>En proceso</option>
              <option${r.status==='Aceptado'?' selected':''}>Aceptado</option>
              <option${r.status==='Cancelado'?' selected':''}>Cancelado</option>
          </select></td>
          <td><input class="edit" data-k="motivo" type="text" value="${escAttr(r.motivo)}" placeholder="Escribe motivo…"></td>
          <td><button class="save">Guardar</button></td>
        </tr>`).join("");
      body.querySelectorAll('button.save').forEach(btn=>{
        btn.addEventListener('click', async ()=>{
          const tr=btn.closest('tr'); const id=tr.getAttribute('data-id');
          const status=tr.querySelector('[data-k="status"]').value;
          const motivo=tr.querySelector('[data-k="motivo"]').value;
          try{
            await db.collection('cotizaciones').doc(id).set({status, motivo},{merge:true});
            btn.textContent='✔'; setTimeout(()=>btn.textContent='Guardar',900);
          }catch(e){ console.error(e); btn.textContent='⚠'; setTimeout(()=>btn.textContent='Guardar',1200); }
        });
      });
    }
  }

  if(document.readyState!=='loading') document.querySelectorAll('[data-cotizaciones-widget]').forEach(init);
  else document.addEventListener('DOMContentLoaded', ()=>document.querySelectorAll('[data-cotizaciones-widget]').forEach(init));
})();