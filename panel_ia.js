// panel_ia.js - Jane AI con Groq LLM + datos reales del CRM

// ────────────────────────────────────────────
//  CONFIGURACIÓN GROQ — Auto-detect entorno
// ────────────────────────────────────────────
const IS_VERCEL = (
  location.hostname.endsWith("vercel.app") ||
  location.hostname.endsWith(".vercel.app")
);

// Siempre definidos para evitar ReferenceError en cualquier entorno
const GROQ_URL       = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL     = "llama-3.3-70b-versatile";
const VERCEL_API_URL = "/api/groq";
// Key: config.js (local/GitHub Pages) → Vercel usa /api/groq con clave segura en env var
const GROQ_API_KEY   = (window.APP_CONFIG && window.APP_CONFIG.GROQ_API_KEY)
                     || "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";


// ────────────────────────────────────────────
//  HELPERS GLOBALES
// ────────────────────────────────────────────
const formatMXN = (v) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(v);

// ────────────────────────────────────────────
//  HELPER: DESGLOSE MENSUAL
// ────────────────────────────────────────────
const MES_NAMES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

/**
 * Agrupa registros por mes usando `fechaField` para la fecha y `montoField` para el monto.
 * Retorna un string multilínea listo para el contexto de Jane.
 */
function desgloseMensual(arr, fechaField, montoField, label = "") {
  const year = new Date().getFullYear();
  const byMonth = {}; // { "2025-01": { monto, count } }

  arr.forEach(r => {
    let raw = r[fechaField];
    if (!raw) return;
    // Soportar Firestore Timestamp, string ISO y Date
    let d;
    if (raw?.seconds) d = new Date(raw.seconds * 1000);
    else d = new Date(raw);
    if (isNaN(d)) return;

    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,"0")}`;
    if (!byMonth[key]) byMonth[key] = { monto: 0, count: 0, mes: MES_NAMES[d.getMonth()], anio: d.getFullYear() };
    byMonth[key].monto += Number(r[montoField] || 0);
    byMonth[key].count += 1;
  });

  const sorted = Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0]));
  if (!sorted.length) return `      (Sin datos mensuales)\n`;

  let out = "";
  sorted.forEach(([, v]) => {
    out += `      • ${v.mes} ${v.anio}: ${formatMXN(v.monto)} (${v.count} reg.)\n`;
  });
  return out;
}

// ────────────────────────────────────────────
//  CONSTRUIR CONTEXTO DE DATOS PARA GROQ
// ────────────────────────────────────────────
function buildDashboardContext() {
  let ctx = "=== DATOS ACTUALES DEL CRM Y OPERACIONES ===\n\n";

  // ---- Nomad ----
  const nomadData = window._nomadData || [];
  const nomadAcc  = nomadData.filter(q => q.accepted);
  const nomadSales = nomadAcc.reduce((s, q) => s + q.total, 0);
  const nomadComm  = nomadAcc.reduce((s, q) => s + (q.matchedCommercial || 0), 0);

  // KAMs Nomad
  const nomadKams = {};
  nomadAcc.forEach(q => {
    const k = q.kam || "Sin asignar";
    if (!nomadKams[k]) nomadKams[k] = { ventas: 0, comisiones: 0, cuentas: 0 };
    nomadKams[k].ventas     += q.total;
    nomadKams[k].comisiones += q.matchedCommercial || 0;
    nomadKams[k].cuentas    += 1;
  });

  // Pipeline Nomad (no aceptadas)
  const nomadPipeline = nomadData.filter(q => !q.accepted).length;

  ctx += `[PLATAFORMA NOMAD DIGITAL]\n`;
  ctx += `  - Ventas cerradas: ${formatMXN(nomadSales)}\n`;
  ctx += `  - Comisiones comerciales acumuladas: ${formatMXN(nomadComm)}\n`;
  ctx += `  - Cotizaciones en pipeline (sin cerrar): ${nomadPipeline}\n`;
  ctx += `  - Cotizaciones cerradas: ${nomadAcc.length}\n`;
  ctx += `  - Pruebas disponibles en catálogo: ${(window.COMMISSIONS_DATA || []).length}\n`;

  if (Object.keys(nomadKams).length > 0) {
    ctx += `  - Desempeño por KAM:\n`;
    Object.entries(nomadKams)
      .sort((a, b) => b[1].ventas - a[1].ventas)
      .forEach(([kam, d]) => {
        ctx += `      • ${kam}: ${d.cuentas} cuentas, ventas ${formatMXN(d.ventas)}, comisiones ${formatMXN(d.comisiones)}\n`;
      });
  }

  // Productos más vendidos en Nomad
  const testCounter = {};
  nomadAcc.forEach(q => {
    (q.pruebas || []).forEach(p => {
      const name = (p?.prueba || p?.nombre || "").trim();
      if (name) testCounter[name] = (testCounter[name] || 0) + (Number(p.cantidad || p.cant || 1));
    });
  });
  const topTests = Object.entries(testCounter).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (topTests.length > 0) {
    ctx += `  - Pruebas/Productos más solicitados:\n`;
    topTests.forEach(([name, qty]) => { ctx += `      • ${name}: ${qty} unidades\n`; });
  }

  // Desglose mensual Nomad
  ctx += `  - Ventas cerradas por mes (Nomad):\n`;
  ctx += desgloseMensual(nomadAcc, "fechaEmision", "total");

  ctx += "\n";

  // ---- Sanare ----
  const sanareData = window._sanareData || [];
  const sanareAcc  = sanareData.filter(q => q.accepted);
  const sanareSales = sanareAcc.reduce((s, q) => s + Number(q.total || q.payment?.montoPagado || 0), 0);
  const sanareComm  = sanareSales * 0.10;
  const sanarePipeline = sanareData.filter(q => !q.accepted).length;

  const sanareKams = {};
  sanareAcc.forEach(q => {
    const k = q.kam || "Sin asignar";
    if (!sanareKams[k]) sanareKams[k] = { ventas: 0, registros: 0 };
    sanareKams[k].ventas    += Number(q.total || q.payment?.montoPagado || 0);
    sanareKams[k].registros += 1;
  });

  ctx += `[PLATAFORMA SANARE CARE]\n`;
  ctx += `  - Ventas cerradas: ${formatMXN(sanareSales)}\n`;
  ctx += `  - Comisiones estimadas (10%): ${formatMXN(sanareComm)}\n`;
  ctx += `  - Cotizaciones en pipeline: ${sanarePipeline}\n`;
  ctx += `  - Cotizaciones cerradas: ${sanareAcc.length}\n`;

  if (Object.keys(sanareKams).length > 0) {
    ctx += `  - Desempeño por KAM:\n`;
    Object.entries(sanareKams)
      .sort((a, b) => b[1].ventas - a[1].ventas)
      .forEach(([kam, d]) => {
        ctx += `      • ${kam}: ${d.registros} registros, ventas ${formatMXN(d.ventas)}, comisiones est. ${formatMXN(d.ventas * 0.10)}\n`;
      });
  }

  // Desglose mensual Sanare
  ctx += `  - Ventas cerradas por mes (Sanare):\n`;
  ctx += desgloseMensual(sanareAcc, "fechaEmision", "total");

  ctx += "\n";

  // ---- GLOBAL ----
  const globalGoal    = 2680000;
  const globalIncome  = nomadSales + sanareSales;
  const globalPct     = Math.min(100, Math.round((globalIncome / globalGoal) * 100));

  ctx += `[RESUMEN GLOBAL Q2]\n`;
  ctx += `  - Ingreso combinado: ${formatMXN(globalIncome)}\n`;
  ctx += `  - Objetivo Q2: ${formatMXN(globalGoal)}\n`;
  ctx += `  - Progreso meta: ${globalPct}%\n`;
  ctx += `  - Faltante para cerrar meta: ${formatMXN(Math.max(0, globalGoal - globalIncome))}\n\n`;

  // ---- CRM PRAXIS (Médicos) ----
  const medicos = window.MEDICOS_DATA || [];
  if (medicos.length > 0) {
    // By estado y hospital desde Firebase
    const byEstado = {};
    const byHosp   = {};
    medicos.forEach(m => {
      const estado = (m["Estado"] || m["estado"] || "").trim();
      const hosp   = (m["Hospital"] || m["hospital"] || "Sin hospital").trim();
      if (estado) byEstado[estado] = (byEstado[estado] || 0) + 1;
      if (hosp && hosp !== "Sin hospital") byHosp[hosp] = (byHosp[hosp] || 0) + 1;
    });

    // By KAM desde el archivo maestro seguimiento_medicos.js (Excel original)
    const seguimiento = window.SEGUIMIENTO_MEDICOS || [];
    let byKam = {};
    if (seguimiento.length > 0) {
      seguimiento.forEach(r => {
        // En el JSON generado del Excel, el campo es "KAM"
        let k = (r.KAM || r.kam || r["GERENTE/KAM"] || "Sin asignar").trim();
        // Capitalizamos la primera letra para unificar (e.g. "OSCAR" -> "Oscar")
        if(k !== "Sin asignar") k = k.charAt(0).toUpperCase() + k.slice(1).toLowerCase();
        byKam[k] = (byKam[k] || 0) + 1;
      });
    } else {
      // Fallback estricto si el archivo JS no cargó a tiempo
      byKam = { "Marymar": 125, "Anayeli": 108, "Berenice": 97, "Claudia": 88, "Oscar": 76, "Dayana": 67, "Alain": 49 };
    }

    const topEstados = Object.entries(byEstado).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const topKamsCRM = Object.entries(byKam).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const topHosp    = Object.entries(byHosp).sort((a, b) => b[1] - a[1]).slice(0, 5);

    ctx += `[CRM MÉDICO - BASE PRAXIS]\n`;
    ctx += `  - Total médicos en base: ${medicos.length}\n`;
    ctx += `  - Estados con mayor cobertura:\n`;
    topEstados.forEach(([e, c]) => { ctx += `      • ${e}: ${c} médicos\n`; });
    ctx += `  - Top KAMs por médicos asignados:\n`;
    topKamsCRM.forEach(([k, c]) => { ctx += `      • ${k}: ${c} médicos asignados\n`; });
    ctx += `  - Top hospitales:\n`;
    topHosp.forEach(([h, c]) => { ctx += `      • ${h}: ${c} médicos\n`; });
    ctx += "\n";
  }

  // ---- Catálogo de comisiones ----
  const catalog = window.COMMISSIONS_DATA || [];
  if (catalog.length > 0) {
    ctx += `[CATÁLOGO DE PRUEBAS DIAGNÓSTICAS]\n`;
    catalog.slice(0, 12).forEach(p => {
      ctx += `  • ${p.prueba}: precio ${formatMXN(p.precioSinIva)}, comisión médico ${formatMXN(p.comisionMedico)}, comisión comercial ${formatMXN(p.comisionComercial)}\n`;
    });
    if (catalog.length > 12) ctx += `  ... y ${catalog.length - 12} pruebas más en catálogo.\n`;
    ctx += "\n";
  }

  // ---- EMBUDO INNVIDA: ventas reales operativas ----
  const embudo = window._embudoData || [];
  if (embudo.length > 0) {
    const pagados       = embudo.filter(r => ["Pago confirmado", "Pago parcial", "Anticipo recibido"].includes(r.pagoStatus));
    const programados   = embudo.filter(r => ["Programada", "Reprogramada", "Aplicada"].includes(r.programacionStatus));
    const aplicados     = embudo.filter(r => r.programacionStatus === "Aplicada");
    const porProgramar  = embudo.filter(r => ["Pago confirmado", "Pago parcial", "Anticipo recibido"].includes(r.pagoStatus) && ["Sin programación", "Por programar"].includes(r.programacionStatus));
    const sinPago       = embudo.filter(r => r.pagoStatus === "Pendiente de pago");
    const totalPagadoMonto = pagados.reduce((s, r) => s + r.pagoMonto, 0);
    const totalActivos  = embudo.filter(r => !["Perdida / rechazada", "Cancelada"].includes(r.status1));

    // Por marca
    const embudoSanare = embudo.filter(r => (r.marca || "").toUpperCase().includes("SANARE") || (r.sourceProject || "").includes("sanare"));
    const embudoNomad  = embudo.filter(r => (r.marca || "").toUpperCase().includes("NOMAD")  || (r.sourceProject || "").includes("nomad"));
    const montoPagadoSanare = embudoSanare.filter(r => pagados.includes(r)).reduce((s, r) => s + r.pagoMonto, 0);
    const montoPagadoNomad  = embudoNomad.filter(r => pagados.includes(r)).reduce((s, r) => s + r.pagoMonto, 0);

    // Por KAM
    const kamPagos = {};
    pagados.forEach(r => {
      const k = r.kam || "Sin asignar";
      if (!kamPagos[k]) kamPagos[k] = { monto: 0, count: 0 };
      kamPagos[k].monto += r.pagoMonto;
      kamPagos[k].count += 1;
    });

    // Por sede
    const sedePagos = {};
    pagados.forEach(r => {
      const s = r.sede || "Sin sede";
      if (!sedePagos[s]) sedePagos[s] = { monto: 0, count: 0 };
      sedePagos[s].monto += r.pagoMonto;
      sedePagos[s].count += 1;
    });

    // Top diagnósticos
    const diagCount = {};
    embudo.forEach(r => {
      const d = (r.diagnostico || "").trim();
      if (d) diagCount[d] = (diagCount[d] || 0) + 1;
    });

    // Top tratamientos
    const tratCount = {};
    embudo.forEach(r => {
      const t = (r.tratamiento || "").trim();
      if (t) tratCount[t] = (tratCount[t] || 0) + 1;
    });
    ctx += `[EMBUDO OPERATIVO INNVIDA — VENTAS REALES]\n`;
    ctx += `  ▸ Total de registros operativos: ${embudo.length}\n`;
    ctx += `  ▸ Cotizaciones activas (sin cancelar): ${totalActivos.length}\n`;
    ctx += `\n  — Conversión del embudo:\n`;
    ctx += `      • Pagos confirmados: ${pagados.length} registros · ${formatMXN(totalPagadoMonto)}\n`;
    ctx += `      • Por programar (pagó, falta cita): ${porProgramar.length}\n`;
    ctx += `      • Programados / con cita agendada: ${programados.length}\n`;
    ctx += `      • Aplicados / servicio entregado: ${aplicados.length}\n`;
    ctx += `      • Sin pago (pendientes): ${sinPago.length}\n`;

    ctx += `\n  — Monto pagado por marca:\n`;
    ctx += `      • Sanaré: ${formatMXN(montoPagadoSanare)} (${embudoSanare.filter(r => pagados.includes(r)).length} pagos)\n`;
    ctx += `      • Nomad:  ${formatMXN(montoPagadoNomad)} (${embudoNomad.filter(r => pagados.includes(r)).length} pagos)\n`;

    // Desglose mensual de pagos reales (Embudo)
    ctx += `\n  — Ingresos reales por mes (Pagos confirmados):\n`;
    ctx += desgloseMensual(pagados, "pagoFecha", "pagoMonto");

    if (Object.keys(kamPagos).length > 0) {
      ctx += `\n  — KAMs con mayor ingreso real cobrado:\n`;
      Object.entries(kamPagos)
        .sort((a, b) => b[1].monto - a[1].monto)
        .slice(0, 8)
        .forEach(([k, d]) => {
          ctx += `      • ${k}: ${d.count} pagos · ${formatMXN(d.monto)}\n`;
        });
    }

    if (Object.keys(sedePagos).length > 0) {
      ctx += `\n  — Actividad por sede (pagos recibidos):\n`;
      Object.entries(sedePagos)
        .sort((a, b) => b[1].monto - a[1].monto)
        .forEach(([s, d]) => {
          ctx += `      • ${s}: ${d.count} pagos · ${formatMXN(d.monto)}\n`;
        });
    }

    const topDiag = Object.entries(diagCount).sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (topDiag.length > 0) {
      ctx += `\n  — Top diagnósticos atendidos:\n`;
      topDiag.forEach(([d, c]) => { ctx += `      • ${d}: ${c} casos\n`; });
    }

    const topTrat = Object.entries(tratCount).sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (topTrat.length > 0) {
      ctx += `\n  — Top tratamientos/esquemas:\n`;
      topTrat.forEach(([t, c]) => { ctx += `      • ${t}: ${c} pacientes\n`; });
    }

    // Tasa de conversión global
    const tasaPago = totalActivos.length > 0 ? Math.round((pagados.length / totalActivos.length) * 100) : 0;
    const tasaProgr = pagados.length > 0 ? Math.round((programados.length / pagados.length) * 100) : 0;
    ctx += `\n  — Tasas de conversión:\n`;
    ctx += `      • Cotización → Pago: ${tasaPago}%\n`;
    ctx += `      • Pago → Programación: ${tasaProgr}%\n`;
    ctx += "\n";

    // ---- ANÁLISIS ESTRATÉGICO (Sugerencias) ----
    ctx += `[ANÁLISIS DE OPORTUNIDADES PARA CRECIMIENTO]\n`;
    
    // 1. KAMs con Pipeline vs Realidad
    ctx += `  - Gaps de Conversión por KAM:\n`;
    const kamStats = {};
    nomadData.forEach(q => {
      const k = q.kam || "Sin asignar";
      if (!kamStats[k]) kamStats[k] = { leads: 0, closed: 0 };
      kamStats[k].leads++;
      if (q.accepted) kamStats[k].closed++;
    });
    Object.entries(kamStats).forEach(([k, s]) => {
      const conv = Math.round((s.closed / s.leads) * 100);
      if (conv < 30 && s.leads > 5) {
        ctx += `      • Alerta: ${k} tiene conversión baja (${conv}% de ${s.leads} leads). Sugerir seguimiento intensivo.\n`;
      }
    });

    // 2. Estados desatendidos
    const medicoStates = {}; medicos.forEach(m => { const e = (m.Estado || m.estado || "Otro").trim(); medicoStates[e] = (medicoStates[e] || 0) + 1; });
    const salesStates = {}; pagados.forEach(r => { const e = (r.sede || "Otro").trim(); salesStates[e] = (salesStates[e] || 0) + 1; });
    ctx += `  - Potencial Geográfico:\n`;
    Object.entries(medicoStates).sort((a,b)=>b[1]-a[1]).slice(0,3).forEach(([e, c]) => {
      if (!salesStates[e]) ctx += `      • Oportunidad: ${e} tiene ${c} médicos pero 0 ventas reales reportadas en el embudo.\n`;
    });

    // 3. Productos Estrella no aprovechados
    const topCommissions = catalog.sort((a,b) => b.comisionComercial - a.comisionComercial).slice(0,3);
    ctx += `  - Productos de Alta Rentabilidad (Priorizar):\n`;
    topCommissions.forEach(p => {
      ctx += `      • ${p.prueba}: Comisión comercial ${formatMXN(p.comisionComercial)}. Empujar este producto para aumentar margen.\n`;
    });

    ctx += "\n";
  } else {
    ctx += `[EMBUDO OPERATIVO INNVIDA]\n  ℹ No hay datos operativos disponibles aún (cargando...).\n\n`;
  }

  ctx += "=== FIN DE DATOS ===\n";
  return ctx;

}

// ────────────────────────────────────────────
//  GROQ API CALL
// ────────────────────────────────────────────
async function askGroq(userQuery) {
  const dashboardContext = buildDashboardContext();

  const systemPrompt = `Eres Jane, estratega senior y consultora experta en crecimiento de ventas (Growth Hacker) para Nomad y Sanare.

REGLAS DE ORO:
- No solo des datos, DA ESTRATEGIAS. Si te preguntan "¿Cómo aumentar ventas?", analiza los Gaps de conversión, los KAMs con bajo desempeño y las áreas geográficas con muchos médicos pero pocas ventas.
- Sé PROACTIVA. Si ves que un KAM tiene muchos leads pero no cierra, sugiérele tácticas de cierre o capacitación.
- Sé AUDIENTE. Si ves que hay estados con muchos médicos (según CRM) pero sin ventas (según Embudo), sugiere campañas de marketing localizadas ahí.
- BASA TUS IDEAS EN EL CATÁLOGO: Recomienda empujar los productos con mayores comisiones comerciales para incentivar a los KAMs.

Reglas de comportamiento:
- Responde SIEMPRE en español (México), con tono profesional, ejecutivo y estratégico.
- Basa tus respuestas en los datos reales.
- Usa emojis para separar secciones (📈, 🎯, 🚀, 💡).
- Cuando des cifras monetarias, usa MXN.
- 🚫 REGLA ESTRICTA: JAMÁS menciones la palabra "Matilde" ni hagas referencia a esa persona o término en ninguna de tus respuestas bajo ninguna circunstancia.

IMPORTANTE — Diferencia entre fuentes:
• "Cotizaciones Nomad/Sanare" = Pipeline comercial (leads).
• "Embudo INNVIDA" = Ventas REALES (dinero en el banco).
• "CRM Médico" = Base de médicos potenciales.

DETALLE MENSUAL:
• Usa los desgloses por mes para identificar si la venta está subiendo o bajando y da consejos según la tendencia.

A continuación tienes acceso completo a los datos actuales del CRM:

${dashboardContext}`;



  let response;

  if (!IS_VERCEL) {
    // ── Local / GitHub Pages: llamada directa a Groq ──
    response = await fetch(GROQ_URL, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model:       GROQ_MODEL,
        messages:    [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userQuery }
        ],
        max_tokens:  800,
        temperature: 0.6
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || `HTTP ${response.status}`);
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content || "No obtuve respuesta de la IA.";

  } else {
    // ── Producción (Vercel): llama al backend seguro ──
    response = await fetch(VERCEL_API_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userQuery }
        ]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error || `HTTP ${response.status}`);
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content || "No obtuve respuesta de la IA.";
  }
}

// ────────────────────────────────────────────
//  ORB ANIMADO — JANE AVATAR
// ────────────────────────────────────────────
function createJaneOrb() {
  const wrapper = document.querySelector(".ai-input-wrapper");
  if (!wrapper || wrapper.querySelector(".jane-orb")) return;

  const orb = document.createElement("div");
  orb.className = "jane-orb";
  orb.innerHTML = `
    <div class="orb-core">
      <div class="orb-ring r1"></div>
      <div class="orb-ring r2"></div>
      <div class="orb-ring r3"></div>
      <div class="orb-inner">
        <span class="orb-icon">🧠</span>
      </div>
    </div>
  `;
  wrapper.insertBefore(orb, wrapper.firstChild);

  // Quitar el emoji viejo si existía
  const oldIcon = wrapper.querySelector(".ai-icon");
  if (oldIcon) oldIcon.remove();
}

function setOrbState(state) {
  // states: 'idle' | 'listening' | 'thinking' | 'speaking'
  const orb = document.querySelector(".jane-orb");
  if (!orb) return;
  orb.dataset.state = state;

  const core = orb.querySelector(".orb-core");
  core.className = `orb-core orb-${state}`;
}

// ────────────────────────────────────────────
//  TYPEWRITER SEGURO (maneja HTML básico)
// ────────────────────────────────────────────
function typeWriter(container, text, speed = 8) {
  return new Promise(resolve => {
    container.innerHTML = "";
    let i = 0, isTag = false, tagBuffer = "", buffer = "";

    function tick() {
      if (i >= text.length) { container.innerHTML = text; resolve(); return; }

      const char = text.charAt(i);
      if (char === "<") { isTag = true; }
      if (isTag) {
        tagBuffer += char;
        if (char === ">") {
          isTag = false;
          buffer += tagBuffer;
          tagBuffer = "";
          container.innerHTML = buffer;
        }
      } else {
        buffer += char;
        container.innerHTML = buffer;
      }
      i++;
      setTimeout(tick, speed);
    }
    tick();
  });
}

// ────────────────────────────────────────────
//  PARTÍCULAS FLOTANTES (fondo del response box)
// ────────────────────────────────────────────
function spawnParticles(container) {
  if (container.querySelector(".jane-particles")) return;
  const canvas = document.createElement("canvas");
  canvas.className = "jane-particles";
  canvas.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:0;border-radius:20px;";
  container.style.position = "relative";
  container.insertBefore(canvas, container.firstChild);

  const ctx = canvas.getContext("2d");
  const particles = [];
  let raf;

  function resize() {
    canvas.width  = container.offsetWidth;
    canvas.height = container.offsetHeight;
  }
  resize();

  for (let k = 0; k < 22; k++) {
    particles.push({
      x:    Math.random() * canvas.width,
      y:    Math.random() * canvas.height,
      r:    Math.random() * 2 + 0.5,
      vx:   (Math.random() - 0.5) * 0.3,
      vy:   (Math.random() - 0.5) * 0.3,
      a:    Math.random() * 0.6 + 0.2
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,255,163,${p.a})`;
      ctx.fill();
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > canvas.width)  p.vx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
    });
    raf = requestAnimationFrame(draw);
  }
  draw();

  // Limpiar cuando se oculte
  container._stopParticles = () => {
    cancelAnimationFrame(raf);
    canvas.remove();
  };
}

// ────────────────────────────────────────────
//  MAIN LÓGICA
// ────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {

  // --- Navegación Sidebar ---
  const navItems      = document.querySelectorAll(".nav-icons .nav-item");
  const viewSections  = document.querySelectorAll(".view-section");

  navItems.forEach(item => {
    item.addEventListener("click", () => {
      if (item.id === "themeToggle") return;
      navItems.forEach(n => { if (n.id !== "themeToggle") n.classList.remove("active"); });
      viewSections.forEach(v => v.classList.remove("active"));
      item.classList.add("active");
      const targetId = item.getAttribute("data-target");
      if (targetId) document.getElementById(targetId)?.classList.add("active");
    });
  });

  // --- Tema Claro/Oscuro ---
  const themeToggle = document.getElementById("themeToggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      document.body.classList.toggle("light-mode");
      const isLight  = document.body.classList.contains("light-mode");
      const svgIcon  = themeToggle.querySelector(".gear-icon");
      if (svgIcon) svgIcon.style.transform = isLight ? "rotate(180deg)" : "rotate(0deg)";
    });
  }

  // --- Crear Orb ---
  createJaneOrb();

  // --- Referencias UI del Chat ---
  const aiPrompt             = document.getElementById("aiPrompt");
  const aiSubmit             = document.getElementById("aiSubmit");
  const aiResponseContainer  = document.getElementById("aiResponseContainer");
  const aiResponseText       = document.getElementById("aiResponseText");
  const aiMicBtn             = document.getElementById("aiMicBtn");
  let askedViaVoice          = false; // Variable para saber si se usó el micrófono

  // ---- HANDLER PRINCIPAL ----
  async function handleAIQuery() {
    const query = aiPrompt.value.trim();
    if (!query) return;

    // Mostrar box
    aiResponseContainer.classList.remove("hidden");
    spawnParticles(aiResponseContainer);

    // Texto de carga animado
    setOrbState("thinking");
    aiResponseText.style.position = "relative";
    aiResponseText.style.zIndex = "1";
    aiResponseText.innerHTML = `<span class="jane-thinking">
      <span class="dot-wave"><span>.</span><span>.</span><span>.</span></span>
      <span style="color:var(--accent); font-family: 'JetBrains Mono', monospace; font-size:0.85rem; margin-left:8px;">Analizando...</span>
    </span>`;

    aiSubmit.disabled = true;
    aiSubmit.textContent = "Pensando...";

    try {
      // Calculadora rápida (sin IA para operaciones simples)
      let mathQuery = query.toLowerCase()
        .replace(/por/g, "*")
        .replace(/más|mas/g, "+")
        .replace(/menos/g, "-")
        .replace(/entre/g, "/");
      const mathMatch = mathQuery.match(/(?:cuanto es|cuánto es|calcula|calculame)\s*([\d\s\+\-\*\/\.\(\)]+)/i);

      let response;
      if (mathMatch && mathMatch[1].trim()) {
        try {
          const expr   = mathMatch[1].replace(/[^-()\d/*+.]/g, "");
          const result = new Function("return " + expr)();
          response = `🧮 <b>Cálculo Jane:</b> El resultado es <b>${new Intl.NumberFormat("es-MX").format(result)}</b>.`;
        } catch { response = await askGroq(query); }
      } else {
        response = await askGroq(query);
      }

      setOrbState("speaking");

      // Formatear markdown básico → HTML
      const htmlResponse = response
        .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
        .replace(/\*(.*?)\*/g, "<i>$1</i>")
        .replace(/^#{1,3}\s(.+)/gm, "<br><b style='color:var(--accent)'>$1</b><br>")
        .replace(/^[-•]\s(.+)/gm, "<br>🔹 $1")
        .replace(/\n\n/g, "<br><br>")
        .replace(/\n/g, "<br>");

      // Hablar si fue consultado por voz
      if (askedViaVoice) {
          speakText(response);
      }

      await typeWriter(aiResponseText, htmlResponse, 6);
      
      // Si no habló por voz, la esfera vuelve a idle directo
      if (!askedViaVoice) setOrbState("idle");

    } catch (err) {
      console.error("Error Groq:", err);
      aiResponseText.innerHTML = `<span style="color:#ff5555;">⚠️ <b>Error al conectar con Jane:</b> ${err.message}. Verifica tu conexión a internet.</span>`;
      setOrbState("idle");
    }

    aiSubmit.disabled = false;
    aiSubmit.textContent = "Enviar Consulta";
    aiPrompt.value = "";
    askedViaVoice = false; // Reset the flag
  }

  // --- Función para Texto a Voz (Siri/Alexa style) ---
  function speakText(text) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel(); // Stop current speech

    // Strip Markdown and HTML tags to make speech sound natural
    let cleanText = text
        .replace(/<[^>]*>?/gm, '') // Remove HTML
        .replace(/\*\*(.*?)\*\*/g, "$1") // Remove bold MD
        .replace(/\*(.*?)\*/g, "$1") // Remove italic MD
        .replace(/^#{1,6}\s*(.*)$/gm, "$1") // Remove headers MD
        .replace(/[-•]\s/g, ""); // Remove bullet points

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = "es-MX";
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    
    // Attempt to find a natural-sounding Spanish voice
    const voices = window.speechSynthesis.getVoices();
    const spanishVoice = voices.find(v => v.lang.includes("es-MX") || v.lang.includes("es-US")) || voices.find(v => v.lang.includes("es"));
    if (spanishVoice) {
      utterance.voice = spanishVoice;
    }

    utterance.onstart = () => setOrbState("speaking");
    utterance.onend = () => setOrbState("idle");
    window.speechSynthesis.speak(utterance);
  }

  aiSubmit.addEventListener("click", handleAIQuery);
  aiPrompt.addEventListener("keypress", e => {
    if (e.key === "Enter") { e.preventDefault(); handleAIQuery(); }
  });

  // --- Voz (Speech Recognition) ---
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (SpeechRecognition && aiMicBtn) {
    const recognition      = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang       = "es-MX";
    recognition.interimResults = false;
    let isListening        = false;

    aiMicBtn.addEventListener("click", () => {
      if (isListening) { recognition.stop(); return; }
      try {
        window.speechSynthesis.cancel(); // Mute if already speaking
        recognition.start();
        aiPrompt.placeholder = "🎙 Escuchando... Di algo a Jane.";
        aiMicBtn.classList.add("listening");
        setOrbState("listening");
        isListening = true;
      } catch (e) { console.error("Mic error:", e); }
    });

    recognition.onresult = event => {
      aiPrompt.value = event.results[0][0].transcript;
      askedViaVoice = true; // Set flag so Jane answers with voice
      setTimeout(handleAIQuery, 600);
    };

    recognition.onspeechend = () => recognition.stop();
    recognition.onend = () => {
      aiMicBtn.classList.remove("listening");
      aiPrompt.placeholder = "Pregúntale a Jane (IA) sobre ventas, comisiones o el CRM...";
      setOrbState("idle");
      isListening = false;
    };
    recognition.onerror = event => {
      console.error("Voice error:", event.error);
      aiMicBtn.classList.remove("listening");
      setOrbState("idle");
      isListening = false;
      if (event.error === "not-allowed") alert("Jane necesita permisos de micrófono.");
    };
  } else if (aiMicBtn) {
    aiMicBtn.style.display = "none";
  }

  // --- CRM Map on tab click ---
  const navCRM = document.querySelector('[data-target="view-crm"]');
  if (navCRM) {
    navCRM.addEventListener("click", () => setTimeout(initCRMMap, 250));
  }
});

// ────────────────────────────────────────────
//  EXPONER datos globales para buildDashboardContext
//  (se llenan desde firebase_dashboard.js)
// ────────────────────────────────────────────
window._nomadData  = window._nomadData  || [];
window._sanareData = window._sanareData || [];

/**
 * Función para vincular un paciente con el Dashboard de la Pulsera
 */
window.vincularPulsera = function(name, age, id) {
  const patient = { name, age, id, timestamp: Date.now() };
  localStorage.setItem('sanare_current_patient', JSON.stringify(patient));
  alert(`✅ Paciente ${name} vinculado a la Pulsera Sanare. Abre el dashboard de la pulsera para ver el monitoreo.`);
};
