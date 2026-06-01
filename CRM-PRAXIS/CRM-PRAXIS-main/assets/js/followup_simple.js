
// followup_simple.js — Botón propio de Seguimiento (Firestore-only, sin recargas)
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getFirestore, doc, getDoc, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { getAuth, signInAnonymously, setPersistence, inMemoryPersistence, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

const app = getApps()[0] || initializeApp(window.FIREBASE_CONFIG);
const db  = getFirestore(app);
const auth = getAuth(app);
setPersistence(auth, inMemoryPersistence);
onAuthStateChanged(auth, ()=>{});
signInAnonymously(auth).catch(()=>{});

async function ensureAuth(){
  if (auth.currentUser) return auth.currentUser;
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (u)=>{ if(u){ unsub(); resolve(u); } });
    signInAnonymously(auth).catch(()=> resolve(null));
    setTimeout(()=> resolve(auth.currentUser||null), 1500);
  });
}


// UI helpers
function el(html){ const d=document.createElement("div"); d.innerHTML=html.trim(); return d.firstElementChild; }
function $(s){ return document.querySelector(s); }
function showToast(msg){
  let box = $("#toastBox"); let t = $("#toast");
  if(!box){ box = el('<div id="toastBox" style="position:fixed;top:16px;right:16px;z-index:3000;"><div id="toast" style="background:#0A497B;color:#fff;padding:12px 14px;border-radius:10px;box-shadow:0 10px 30px rgba(10,73,123,.35);font-weight:600;letter-spacing:.2px;"></div></div>'); document.body.appendChild(box); t = $("#toast"); }
  t.textContent = msg; box.style.display="block"; setTimeout(()=>box.style.display="none", 1600);
}

// Modal minimal
const modal = el(`
<div id="segSimpleModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;align-items:center;justify-content:center;">
  <div style="background:#0f172a;color:#e5e7eb;width:min(740px,92vw);border-radius:14px;padding:18px;border:1px solid #1e293b;box-shadow:0 14px 34px rgba(0,0,0,.5)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <h3 style="margin:0">Seguimiento — <span id="segMedicoNombre"></span></h3>
      <button id="segSimpleClose" class="btn ghost">Cerrar</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <input type="hidden" id="segMedicoId">
      <label>Estado<select id="segEstado" class="input" style="padding:10px;border-radius:10px;border:1px solid #334155;background:#0b1220;color:#fff;">
        <option>Contactado</option><option>Sin respuesta</option><option>En seguimiento</option><option>Cerrado</option>
      </select></label>
      <label>Próxima acción / Fecha de visita<input id="segFecha" type="date" class="input" style="padding:10px;border-radius:10px;border:1px solid #334155;background:#0b1220;color:#fff;"></label>
      <label style="grid-column:1/-1;">Comentarios<textarea id="segComentarios" rows="3" style="width:100%;padding:10px;border-radius:10px;border:1px solid #334155;background:#0b1220;color:#fff;"></textarea></label>
      <label style="grid-column:1/-1;">KAM<input id="segKAM" class="input" style="padding:10px;border-radius:10px;border:1px solid #334155;background:#0b1220;color:#fff;"></label>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
      <button id="segSimpleSave" class="btn">Guardar</button>
    </div>
    <div id="segHist" style="margin-top:14px;padding-top:8px;border-top:1px solid #1f2937;"></div>
  </div>
</div>`);
document.body.appendChild(modal);

$("#segSimpleClose").addEventListener("click", ()=> modal.style.display="none");

let unsubHist = null;
async function openSeguimiento(docId){
  try{
    const snap = await getDoc(doc(db, "medicos", docId));
    const data = snap.data() || {};
    $("#segMedicoNombre").textContent = data.nombre || "(sin nombre)";
    $("#segMedicoId").value = docId;
    modal.style.display = "flex";

    // render historial realtime
    if (unsubHist) { try{unsubHist();}catch{} }
    const qy = query(collection(db, "medicos", docId, "seguimientos"), orderBy("createdAt","desc"));
    unsubHist = onSnapshot(qy, (s)=>{
      const cont = $("#segHist");
      const items = s.docs.map(d => {
        const v = d.data()||{};
        const dt = v.createdAt && v.createdAt.toDate ? v.createdAt.toDate() : new Date();
        const f  = dt.toISOString().slice(0,10);
        return `<div class="item" style="padding:6px 0;border-bottom:1px solid #1f2937">
                  <div><strong>${f}</strong> — ${v.estado||"-"} ${v.kam?`(${v.kam})`:""}</div>
                  <div style="opacity:.9">${v.comentarios||""}</div>
                  ${v.proximaAccion?`<div style="opacity:.7">Próxima: ${v.proximaAccion}</div>`:""}
                </div>`;
      }).join("") || "<em>Sin seguimientos</em>";
      cont.innerHTML = items;
    });
  }catch(e){
    console.error("[openSeguimiento]", e);
    alert("No pude abrir el seguimiento. Revisa la consola.");
  }
}

$("#segSimpleSave").addEventListener("click", async ()=>{
  try{
    const docId = $("#segMedicoId").value;
    if(!docId){ alert("Falta el ID del médico"); return; }
    const user = await ensureAuth();
    if(!user){ alert("No hay sesión (anon). Revisa bloqueadores)."); return; }
    // normalize & limits to satisfy rules
    let estado = ($("#segEstado").value||"").toString().trim();
    if(estado.length>40) estado = estado.slice(0,40);
    let kam = ($("#segKAM").value||"").toString().trim();
    if(kam.length>120) kam = kam.slice(0,120);
    const comentarios = ($("#segComentarios").value||"").toString();
    const proximaAccion = ($("#segFecha").value || null);

    const payload = { estado, proximaAccion, comentarios, kam, createdAt: serverTimestamp(), createdBy: user.uid };
    // Log para depurar con reglas estrictas
    console.log("[seguimiento:payload]", payload);
    try{
    await addDoc(collection(db, "medicos", docId, "seguimientos"), payload);
  } catch(e) {
    if (e && e.code === "permission-denied") {
      const alt = Object.assign({}, payload);
      alt.createdBY = alt.createdBy; delete alt.createdBy;
      console.warn("[seguimiento:save] retry with createdBY", alt);
      await addDoc(collection(db, "medicos", docId, "seguimientos"), alt);
    } else {
      throw e;
    }
  }
  showToast("Guardado en Firestore ✓");
  $("#segComentarios").value = ""; $("#segKAM").value = "";
  }catch(e){
    console.error("[seguimiento:save]", e);
    alert("No pude guardar en Firestore. Revisa reglas y conexión.");
  }
});

// Inyecta nuestro botón y lo separa del mecanismo previo
function wireButtons(){
  const rows = Array.from(document.querySelectorAll('#tbody-medicos tr'));
  rows.forEach(tr => {
    // buscar id en el botón existente (si el renderer lo puso)
    let id = tr.querySelector('button[data-id]')?.getAttribute('data-id') || "";
    // crea nuestro botón
    let cell = tr.lastElementChild;
    if (!cell) return;
    let exists = cell.querySelector('.btn-followup');
    if (exists) return;
    const btn = el('<button class="btn btn-followup">+ Seguimiento</button>');
    btn.addEventListener('click', ()=> { if(id && id.length>5) openSeguimiento(id); else alert("No tengo el ID del médico"); });
    cell.innerHTML = ""; cell.appendChild(btn); // reemplaza el botón anterior para evitar conflictos
  });
}

new MutationObserver(wireButtons).observe(document.body,{childList:true,subtree:true});
window.addEventListener('load', wireButtons);
setInterval(wireButtons, 800); // watchdog suave
