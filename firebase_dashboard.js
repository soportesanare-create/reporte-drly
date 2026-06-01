const firebaseConfigNomad = {
  apiKey: "AIzaSyDhtKZlWpHdhFcnVzWovB93bRSVRkC1sDI",
  authDomain: "cotizador-nomad.firebaseapp.com",
  projectId: "cotizador-nomad",
  storageBucket: "cotizador-nomad.firebasestorage.app",
  messagingSenderId: "736481537624",
  appId: "1:736481537624:web:6f06667cf34bccc532642d"
};

const firebaseConfigSanare = {
  apiKey: "AIzaSyAX1AA7tTnlnApVZlnnuMkB42k3W5IlwoM",
  authDomain: "sanare-cotizador.firebaseapp.com",
  projectId: "sanare-cotizador",
  storageBucket: "sanare-cotizador.firebasestorage.app",
  messagingSenderId: "902613920907",
  appId: "1:902613920907:web:0e73bd5def3cf4396a788e"
};

// ── Embudo INNVIDA (datos operativos: pagos reales + programación) ──
const firebaseConfigEmbudo = {
  apiKey: "AIzaSyBqQywIlbMo9nSOC3zI3u7nRshs4rDedMM",
  authDomain: "embudo-innvida.firebaseapp.com",
  projectId: "embudo-innvida",
  storageBucket: "embudo-innvida.firebasestorage.app",
  messagingSenderId: "988847530129",
  appId: "1:988847530129:web:fd89909a969431df329f30"
};

// ── CRM INNVIDA (Datos reales de médicos y asignación KAM) ──
const firebaseConfigCrmInnvida = {
  apiKey: "AIzaSyAyksNhyRX-7QnZSOF27txNU-_SeMoOGps",
  authDomain: "crm-innvida-76e2e.firebaseapp.com",
  projectId: "crm-innvida-76e2e",
  storageBucket: "crm-innvida-76e2e.firebasestorage.app",
  messagingSenderId: "865341286325",
  appId: "1:865341286325:web:9fe061fa3c2c7fea4e9bfc"
};

const appNomad = firebase.initializeApp(firebaseConfigNomad, "nomadApp");
const dbNomad = appNomad.firestore();

const appSanare = firebase.initializeApp(firebaseConfigSanare, "sanareApp");
const dbSanare = appSanare.firestore();

const appEmbudo = firebase.initializeApp(firebaseConfigEmbudo, "embudoApp");
const dbEmbudo = appEmbudo.firestore();

const appCrmInnvida = firebase.initializeApp(firebaseConfigCrmInnvida, "crmInnvidaApp");
const dbCrmInnvida = appCrmInnvida.firestore();

if (window.Chart) {
  Chart.defaults.color = '#8a8f98';
  Chart.defaults.font.family = "'Inter', sans-serif";
}

function normalize(text) {
  return (text || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isAccepted(status1) {
  const value = normalize(status1);
  return value.includes("aceptada") || value.includes("cerrada") || value.includes("aceptado");
}

const commissionMap = new Map();
if (window.COMMISSIONS_DATA) {
  window.COMMISSIONS_DATA.forEach((item) => {
    commissionMap.set(normalize(item.prueba), item);
  });
}

function findCommissionForTest(testName) {
  const normalized = normalize(testName);
  if (commissionMap.has(normalized)) return commissionMap.get(normalized);
  for (const [key, value] of commissionMap.entries()) {
    if (normalized.includes(key) || key.includes(normalized)) return value;
  }
  return null;
}

const formatMoney = (val) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(val);
const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

let nomadData = [];
let sanareData = [];
let embudoData = []; // datos operativos reales del embudo-innvida
let nomadChartInstance = null;
let sanareChartInstance = null;

function getMonthlyData(quotesArray) {
  // Agrupar ventas por "YYYY-MM"
  const byKey = {};

  quotesArray.forEach(q => {
    if (!q.accepted || !q.fechaEmision) return;
    let d;
    if (q.fechaEmision?.seconds) {
      d = new Date(q.fechaEmision.seconds * 1000);
    } else {
      d = new Date(q.fechaEmision);
    }
    if (isNaN(d.getTime())) return;

    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
    if (!byKey[key]) byKey[key] = { label, total: 0 };
    byKey[key].total += q.total;
  });

  const now = new Date();
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  if (Object.keys(byKey).length === 0) {
    // Sin datos: mostrar los meses del año actual hasta el actual
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    return {
      labels: monthNames.slice(0, currentMonth + 1).map(m => `${m} ${currentYear}`),
      data: new Array(currentMonth + 1).fill(0)
    };
  }

  // Rellenar meses vacíos entre el primer y el mes actual (sin saltos)
  const allKeys = Object.keys(byKey).sort();
  const firstKey = allKeys[0];
  const endKey = currentKey > allKeys[allKeys.length - 1] ? currentKey : allKeys[allKeys.length - 1];

  const filled = [];
  let [fy, fm] = firstKey.split('-').map(Number);
  const [ey, em] = endKey.split('-').map(Number);

  while (fy < ey || (fy === ey && fm <= em)) {
    const key = `${fy}-${String(fm).padStart(2, '0')}`;
    const label = `${monthNames[fm - 1]} ${fy}`;
    filled.push({ key, label, total: byKey[key]?.total || 0 });
    fm++;
    if (fm > 12) { fm = 1; fy++; }
  }

  return {
    labels: filled.map(v => v.label),
    data: filled.map(v => v.total)
  };
}

function mapNomadQuote(data, id) {
  const rawTests = Array.isArray(data.pruebas) ? data.pruebas : [];
  const tests = rawTests.map((item) => {
    const prueba = (item?.prueba || item?.nombre || item?.descripcion || "").toString().trim();
    const quantity = Number(item?.cantidad || item?.cant || 1) || 1;
    const commission = findCommissionForTest(prueba);
    return {
      prueba,
      comisionComercialTotal: commission ? Number(commission.comisionComercial || 0) * quantity : 0
    };
  });

  const matchedCommercial = tests.reduce((sum, item) => sum + item.comisionComercialTotal, 0);

  return {
    id,
    fechaEmision: data.fechaEmision || data.createdAt,
    kam: data.kam || data.vendedor || "Sin asignar",
    medico: data.medico || "Sin asignar",
    total: Number(data.total || data.payment?.montoPagado || 0),
    matchedCommercial,
    accepted: isAccepted(data.status1 || ""),
    status1: data.status1 || "Sin seguimiento"
  };
}

function updateDashboard() {
  // Nomad Data Processing
  const nomadAccepted = nomadData.filter(q => q.accepted);
  const nomadTotalSales = nomadAccepted.reduce((sum, q) => sum + q.total, 0);
  const nomadTotalCommissions = nomadAccepted.reduce((sum, q) => sum + q.matchedCommercial, 0);

  const elNomadSalesTotal = document.getElementById("nomadSalesTotal");
  if (elNomadSalesTotal) elNomadSalesTotal.innerHTML = `${formatMoney(nomadTotalSales)} <span class="currency">MXN</span>`;
  
  const elNomadCommTotal = document.getElementById("nomadCommissionsTotal");
  if (elNomadCommTotal) elNomadCommTotal.innerHTML = `${formatMoney(nomadTotalCommissions)} <span class="currency">MXN</span>`;
  
  const nomadKams = {};
  nomadAccepted.forEach(q => {
    const k = q.kam;
    if (!nomadKams[k]) nomadKams[k] = { sales: 0, commissions: 0, count: 0 };
    nomadKams[k].sales += q.total;
    nomadKams[k].commissions += q.matchedCommercial;
    nomadKams[k].count += 1;
  });

  const nomadTableBody = document.getElementById("nomadKamTableBody");
  if (nomadTableBody && Object.keys(nomadKams).length > 0) {
    nomadTableBody.innerHTML = Object.entries(nomadKams).map(([kam, data]) => {
      const initials = kam.substring(0,2).toUpperCase();
      const pct = Math.min(100, Math.round((data.sales / 500000) * 100)); // Arbitrary KAM goal mapping
      return `
        <tr>
          <td><div class="doc-info"><div class="avatar">${initials}</div> ${kam}</div></td>
          <td>${data.count} Cuentas</td>
          <td>
            <div style="display:flex; align-items:center; gap:10px;">
                <div class="progress-bar-bg" style="width: 100px; height: 6px; background: rgba(255,255,255,0.1); border-radius: 4px;">
                    <div class="progress-fill" style="width: ${pct}%; height: 100%; background: #3b82f6; border-radius: 4px;"></div>
                </div>
                <span style="font-size: 0.8rem;">Ventas: ${formatMoney(data.sales)}</span>
            </div>
          </td>
          <td><span style="color: #00ffa3; font-weight: 500;">${formatMoney(data.commissions)} MXN</span></td>
        </tr>
      `;
    }).join("");
  }

  // Nomad Chart
  const nomadMonthly = getMonthlyData(nomadData);
  const canvasNomad = document.getElementById('nomadChart');
  if (canvasNomad && window.Chart) {
      if (nomadChartInstance) nomadChartInstance.destroy();
      const ctxNomad = canvasNomad.getContext('2d');
      let gradientNomad = ctxNomad.createLinearGradient(0, 0, 0, 160);
      gradientNomad.addColorStop(0, 'rgba(59, 130, 246, 0.4)');
      gradientNomad.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

      nomadChartInstance = new Chart(ctxNomad, {
          type: 'line',
          data: {
              labels: nomadMonthly.labels,
              datasets: [{
                  label: 'Ventas Nomad',
                  data: nomadMonthly.data,
                  borderColor: '#3b82f6',
                  borderWidth: 3,
                  backgroundColor: gradientNomad,
                  fill: true,
                  tension: 0.4,
                  pointRadius: 4,
                  pointHoverRadius: 6
              }]
          },
          options: {
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                x: {
                  display: true,
                  grid: { display: false },
                  ticks: { color: '#8a8f98', font: { size: 10 }, maxRotation: 45 }
                },
                y: { display: false, grid: { display: false }, min: 0 }
              }
          }
      });
  }

  // ── Sanare: datos desde Embudo INNVIDA ─────────────────────────────────────
  const SANARE_PAID_STATUSES = ['Pago confirmado', 'Pago parcial', 'Anticipo recibido'];
  const embudoSanareRecs = embudoData.filter(r => {
    const marca = (r.marca || r.sourceProject || '').toUpperCase();
    return marca.includes('SANARE');
  });
  const embudoSanarePagados = embudoSanareRecs.filter(r => SANARE_PAID_STATUSES.includes(r.pagoStatus));
  const sanareTotalSales = embudoSanarePagados.reduce((s, r) => s + r.pagoMonto, 0);
  const sanareTotalCommissions = sanareTotalSales * 0.10;

  const elSanareSalesTotal = document.getElementById("sanareSalesTotal");
  if (elSanareSalesTotal) elSanareSalesTotal.innerHTML = `${formatMoney(sanareTotalSales)} <span class="currency">MXN</span>`;

  const elSanareCommTotal = document.getElementById("sanareCommissionsTotal");
  if (elSanareCommTotal) elSanareCommTotal.innerHTML = `${formatMoney(sanareTotalCommissions)} <span class="currency">MXN</span>`;

  // KAMs Sanare desde embudo
  const sanareKams = {};
  embudoSanarePagados.forEach(r => {
    const k = r.kam || 'Sin asignar';
    if (!sanareKams[k]) sanareKams[k] = { sales: 0, count: 0 };
    sanareKams[k].sales += r.pagoMonto;
    sanareKams[k].count += 1;
  });

  const sanareTableBody = document.getElementById("sanareKamTableBody");
  if (sanareTableBody && Object.keys(sanareKams).length > 0) {
    sanareTableBody.innerHTML = Object.entries(sanareKams).map(([kam, data]) => {
      const initials = kam.substring(0,2).toUpperCase();
      const pct = Math.min(100, Math.round((data.sales / 300000) * 100));
      return `
        <tr>
          <td><div class="doc-info"><div class="avatar">${initials}</div> ${kam}</div></td>
          <td>${data.count} Pagos</td>
          <td>
            <div style="display:flex; align-items:center; gap:10px;">
                <div class="progress-bar-bg" style="width: 100px; height: 6px; background: rgba(255,255,255,0.1); border-radius: 4px;">
                    <div class="progress-fill" style="width: ${pct}%; height: 100%; background: #ec4899; border-radius: 4px;"></div>
                </div>
                <span style="font-size: 0.8rem;">Ventas: ${formatMoney(data.sales)}</span>
            </div>
          </td>
          <td><span style="color: #00ffa3; font-weight: 500;">${formatMoney(data.sales * 0.10)} MXN</span></td>
        </tr>
      `;
    }).join("");
  }

  // Sanare Chart — fusiona cotizaciones históricas + pagos reales del embudo
  const sanareMonthlyCot = getMonthlyData(sanareData);       // meses históricos
  const sanareMonthlyEmb = getSanareMonthlyFromEmbudo(embudoSanarePagados); // pagos reales

  // Merge: unir todos los keys (mes-año) de ambas fuentes
  function mergeMonthlyLabels(a, b) {
    const map = {};
    a.labels.forEach((lbl, i) => { map[lbl] = (map[lbl] || 0) + a.data[i]; });
    b.labels.forEach((lbl, i) => { map[lbl] = (map[lbl] || 0) + b.data[i]; });
    // Ordenar cronológicamente
    const sorted = Object.entries(map).sort((x, y) => {
      const toNum = s => { const p = s.split(' '); return Number(p[1]) * 100 + monthNames.indexOf(p[0]); };
      return toNum(x[0]) - toNum(y[0]);
    });
    return { labels: sorted.map(e => e[0]), data: sorted.map(e => e[1]) };
  }
  const sanareMonthly = mergeMonthlyLabels(sanareMonthlyCot, sanareMonthlyEmb);

  const canvasSanare = document.getElementById('sanareChart');
  if (canvasSanare && window.Chart) {
      if (sanareChartInstance) sanareChartInstance.destroy();
      const ctxSanare = canvasSanare.getContext('2d');
      sanareChartInstance = new Chart(ctxSanare, {
          type: 'bar',
          data: {
              labels: sanareMonthly.labels,
              datasets: [{
                  label: 'Ventas Sanare',
                  data: sanareMonthly.data,
                  backgroundColor: '#ec4899',
                  borderRadius: 6,
                  barPercentage: 0.5
              }]
          },
          options: {
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                x: {
                  display: true,
                  grid: { display: false },
                  ticks: { color: '#8a8f98', font: { size: 10 }, maxRotation: 45 }
                },
                y: { display: false, grid: { display: false }, min: 0 }
              }
          }
      });
  }

  // Global Metas Progress
  const globalGoal = 2680000;
  const globalIncome = nomadTotalSales + sanareTotalSales;
  const progressPercent = Math.min(100, Math.max(0, (globalIncome / globalGoal) * 100));
  
  const circle = document.getElementById("mainProgressCircle");
  if (circle) circle.style.setProperty('--progress', Math.round(progressPercent));
  
  const pctText = document.getElementById("goalPercentageText");
  if (pctText) pctText.textContent = `${Math.round(progressPercent)}%`;
  
  const currText = document.getElementById("goalCurrentText");
  if (currText) currText.textContent = `$${(globalIncome / 1000000).toFixed(2)}M`;
  
  const targetText = document.getElementById("goalTargetText");
  if (targetText) targetText.textContent = `$${(globalGoal / 1000000).toFixed(2)}M`;

  // ── CRM Leads: TODOS en tiempo real ─────────────────────────────────────────
  const allCrmLeads = [
    ...nomadData.map(q => ({
      nombre:  q.medico || 'Sin médico',
      marca:   'Nomad Digital',
      tag:     'tag-nomad',
      color:   'rgba(0,255,163,0.1)',
      textC:   'var(--accent)',
      kam:     q.kam || 'Sin asignar',
      monto:   q.total || 0,
      status1: q.status1 || 'Sin seguimiento',
      accepted: q.accepted
    })),
    ...sanareData.map(q => ({
      nombre:  q.medico || q.paciente || 'Sin asignar',
      marca:   'Sanare Care',
      tag:     'tag-sanare',
      color:   'rgba(236,72,153,0.1)',
      textC:   '#ec4899',
      kam:     q.kam || 'Sin asignar',
      monto:   Number(q.total || q.payment?.montoPagado || 0),
      status1: q.status1 || 'Sin seguimiento',
      accepted: q.accepted
    }))
  ].filter(q => !q.accepted && q.status1 !== 'Perdida / rechazada' && q.status1 !== 'Cancelada');

  window._allCrmLeads = allCrmLeads; // Para búsqueda

  const crmTableBody = document.getElementById('crmTableBody');
  const crmBadge = document.getElementById('crmCountBadge');
  if (crmBadge) crmBadge.textContent = `${allCrmLeads.length} leads`;

  function renderCrmRows(leads) {
    if (!crmTableBody) return;
    if (!leads.length) {
      crmTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#8a8f98; padding:2rem;">Sin leads activos</td></tr>';
      return;
    }
    crmTableBody.innerHTML = leads.map(lead => {
      const initials = lead.nombre.replace(/Dr\.?\s|Dra\.?\s/gi,'').substring(0,2).toUpperCase();
      const statusColor = lead.status1.toLowerCase().includes('activ') ? '#00ffa3'
        : lead.status1.toLowerCase().includes('seguimiento') ? '#f59e0b' : '#8a8f98';
      return `
        <tr>
          <td><div class="doc-info"><div class="avatar" style="background:${lead.color};color:${lead.textC};">${initials}</div> ${lead.nombre}</div></td>
          <td><span class="tag ${lead.tag}">${lead.marca}</span></td>
          <td>${lead.kam}</td>
          <td style="color:#00ffa3; font-weight:500;">${lead.monto > 0 ? formatMoney(lead.monto) : '—'}</td>
          <td><span style="font-size:0.78rem; color:${statusColor};">${lead.status1}</span></td>
        </tr>`;
    }).join('');
  }
  renderCrmRows(allCrmLeads);

  // ── Embudo INNVIDA: KPIs + Tabla detalle ────────────────────────────────────
  const PAID = ['Pago confirmado','Pago parcial','Anticipo recibido'];
  const pagadosTodos = embudoData.filter(r => PAID.includes(r.pagoStatus));
  const aplicados    = embudoData.filter(r => r.programacionStatus === 'Aplicada');
  const ingresoTotal = pagadosTodos.reduce((s, r) => s + r.pagoMonto, 0);

  const el = id => document.getElementById(id);
  if (el('embudoTotalCount'))   el('embudoTotalCount').textContent   = embudoData.length;
  if (el('embudoPagadosCount')) el('embudoPagadosCount').textContent = pagadosTodos.length;
  if (el('embudoIngresoReal'))  el('embudoIngresoReal').textContent  = formatMoney(ingresoTotal);
  if (el('embudoAplicadosCount')) el('embudoAplicadosCount').textContent = aplicados.length;

  const embudoBadge = el('embudoCountBadge');
  if (embudoBadge) embudoBadge.textContent = `${embudoData.length} registros`;

  window._embudoRows = embudoData; // Para búsqueda

  function renderEmbudoRows(rows) {
    const body = el('embudoDetailBody');
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#8a8f98;padding:2rem;">Sin registros en el embudo</td></tr>';
      return;
    }
    body.innerHTML = rows.map(r => {
      const pagoColor = PAID.includes(r.pagoStatus) ? '#00ffa3'
        : r.pagoStatus === 'Pendiente de pago' ? '#f59e0b' : '#8a8f98';
      const progColor = r.programacionStatus === 'Aplicada' ? '#00ffa3'
        : ['Programada','Reprogramada'].includes(r.programacionStatus) ? '#3b82f6'
        : '#8a8f98';
      const marcaTag  = (r.marca||'').toUpperCase().includes('SANARE') ? 'tag-sanare' : 'tag-nomad';
      const marcaName = (r.marca||'').toUpperCase().includes('SANARE') ? 'Sanare' : 'Nomad';
      const fechaPago = r.pagoFecha ? (r.pagoFecha.seconds
        ? new Date(r.pagoFecha.seconds*1000).toLocaleDateString('es-MX')
        : new Date(r.pagoFecha).toLocaleDateString('es-MX')) : '—';
      return `
        <tr>
          <td style="font-weight:500;">${r.paciente || '—'}</td>
          <td><span class="tag ${marcaTag}">${marcaName}</span></td>
          <td>${r.kam || '—'}</td>
          <td>${r.sede || '—'}</td>
          <td><span style="font-size:0.78rem;color:${pagoColor};">${r.pagoStatus}</span></td>
          <td style="color:#00ffa3;font-weight:500;">${r.pagoMonto > 0 ? formatMoney(r.pagoMonto) : '—'}</td>
          <td><span style="font-size:0.78rem;color:${progColor};">${r.programacionStatus}</span></td>
          <td style="font-size:0.78rem;color:#8a8f98;">${r.tratamiento || r.servicio || '—'}</td>
          <td style="font-size:0.78rem;color:#8a8f98;">${fechaPago}</td>
        </tr>`;
    }).join('');
  }
  renderEmbudoRows(embudoData);

  // Forecast Logic
  renderForecastChart(nomadMonthly, sanareMonthly);
}

let currentForecastView = 'global';

// ────────────────────────────────────────────
//  SANARE: datos mensuales desde Embudo
// ────────────────────────────────────────────
function getSanareMonthlyFromEmbudo(pagados) {
  const byKey = {};
  pagados.forEach(r => {
    if (!r.pagoFecha || !r.pagoMonto) return;
    let d;
    if (r.pagoFecha?.seconds) d = new Date(r.pagoFecha.seconds * 1000);
    else d = new Date(r.pagoFecha);
    if (isNaN(d.getTime())) return;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
    if (!byKey[key]) byKey[key] = { label, total: 0 };
    byKey[key].total += r.pagoMonto;
  });

  const now = new Date();
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (Object.keys(byKey).length === 0) {
    return { labels: monthNames.slice(0, now.getMonth() + 1).map(m => `${m} ${now.getFullYear()}`), data: new Array(now.getMonth() + 1).fill(0) };
  }
  const allKeys = Object.keys(byKey).sort();
  const firstKey = allKeys[0];
  const endKey = currentKey > allKeys[allKeys.length - 1] ? currentKey : allKeys[allKeys.length - 1];
  const filled = [];
  let [fy, fm] = firstKey.split('-').map(Number);
  const [ey, em] = endKey.split('-').map(Number);
  while (fy < ey || (fy === ey && fm <= em)) {
    const key = `${fy}-${String(fm).padStart(2, '0')}`;
    filled.push({ label: `${monthNames[fm - 1]} ${fy}`, total: byKey[key]?.total || 0 });
    fm++; if (fm > 12) { fm = 1; fy++; }
  }
  return { labels: filled.map(v => v.label), data: filled.map(v => v.total) };
}
let nomadHistoryChartInstance = null;

// ────────────────────────────────────────────
//  NOMAD: Comparativa histórica 2025 vs 2026
// ────────────────────────────────────────────
function renderNomadHistoryChart(allNomadData) {
  const canvas = document.getElementById('nomadHistoryChart');
  if (!canvas || !window.Chart) return;

  if (nomadHistoryChartInstance) nomadHistoryChartInstance.destroy();

  // ── Datos históricos reales 2025 (Ene→Dic) ──────────────────────────────────
  const data2025 = [
    224804.72,    // Enero
    1889916.50,   // Febrero
    1015464.06,   // Marzo
    1977582.27,   // Abril
    2658709.71,   // Mayo
    3392086.20,   // Junio
    3665431.03,   // Julio
    2040097.59,   // Agosto
    2308017.24,   // Septiembre
    2682655.31,   // Octubre
    2024155.33,   // Noviembre
    2089965.88    // Diciembre
  ];

  // ── Datos dinámicos 2026 desde Firebase ─────────────────────────────────────
  const data2026 = new Array(12).fill(0);
  allNomadData.forEach(q => {
    if (!q.accepted || !q.fechaEmision) return;
    let d;
    if (q.fechaEmision?.seconds) d = new Date(q.fechaEmision.seconds * 1000);
    else d = new Date(q.fechaEmision);
    if (isNaN(d.getTime())) return;
    if (d.getFullYear() === 2026) data2026[d.getMonth()] += q.total;
  });

  const ctx2025 = canvas.getContext('2d');

  const grad2025 = ctx2025.createLinearGradient(0, 0, 0, 300);
  grad2025.addColorStop(0, 'rgba(59, 130, 246, 0.28)');
  grad2025.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

  const grad2026 = ctx2025.createLinearGradient(0, 0, 0, 300);
  grad2026.addColorStop(0, 'rgba(249, 115, 22, 0.28)');
  grad2026.addColorStop(1, 'rgba(249, 115, 22, 0.0)');

  nomadHistoryChartInstance = new Chart(ctx2025, {
    type: 'line',
    data: {
      labels: monthNames,
      datasets: [
        {
          label: '2025',
          data: data2025,
          borderColor: '#3b82f6',
          backgroundColor: grad2025,
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointRadius: 5,
          pointHoverRadius: 8,
          pointBackgroundColor: '#3b82f6',
          pointBorderColor: '#0f1623',
          pointBorderWidth: 2
        },
        {
          label: '2026',
          data: data2026,
          borderColor: '#f97316',
          backgroundColor: grad2026,
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointRadius: 5,
          pointHoverRadius: 8,
          pointBackgroundColor: '#f97316',
          pointBorderColor: '#0f1623',
          pointBorderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: { color: '#e5e7eb', font: { size: 13, weight: '600' }, boxWidth: 14, padding: 18, usePointStyle: true, pointStyle: 'circle' }
        },
        tooltip: {
          backgroundColor: 'rgba(15, 22, 35, 0.95)',
          titleColor: '#e5e7eb',
          bodyColor: '#8a8f98',
          borderColor: 'rgba(59,130,246,0.35)',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${formatMoney(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#8a8f98', font: { size: 11 } }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: {
            color: '#8a8f98',
            callback: (v) => v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`
          },
          min: 0
        }
      }
    }
  });
}

function renderForecastChart(nomadMonthly, sanareMonthly) {
  let historyData = [];
  let labels = [];
  let labelSuffix = '';
  let color = '#00ffa3';
  let gradientStop = 'rgba(0, 255, 163, 0.4)';

  if (currentForecastView === 'global') {
    // Unir labels de ambas fuentes cronológicamente
    const allKeys = new Set([...nomadMonthly.labels, ...sanareMonthly.labels]);
    const toDate = s => { const parts = s.split(' '); return Number(parts[1]) * 100 + monthNames.indexOf(parts[0]); };
    const sortedKeys = [...allKeys].sort((a, b) => toDate(a) - toDate(b));
    labels = sortedKeys;
    historyData = sortedKeys.map(lbl => {
      const nIdx = nomadMonthly.labels.indexOf(lbl);
      const sIdx = sanareMonthly.labels.indexOf(lbl);
      return (nIdx >= 0 ? nomadMonthly.data[nIdx] : 0) + (sIdx >= 0 ? sanareMonthly.data[sIdx] : 0);
    });
    labelSuffix = 'Global';
  } else if (currentForecastView === 'nomad') {
    historyData = [...nomadMonthly.data];
    labels = [...nomadMonthly.labels];
    labelSuffix = 'Nomad';
    color = '#3b82f6';
    gradientStop = 'rgba(59, 130, 246, 0.4)';
  } else if (currentForecastView === 'sanare') {
    historyData = [...sanareMonthly.data];
    labels = [...sanareMonthly.labels];
    labelSuffix = 'Sanare';
    color = '#ec4899';
    gradientStop = 'rgba(236, 72, 153, 0.4)';
  }

  // Agregar 3 meses de proyección al final con año incluido
  const growth = 1.05;
  let lastVal = historyData[historyData.length - 1] || 500000;
  const forecastData = [...historyData];
  const nextMonths = 3;
  const now = new Date();
  let projMonth = now.getMonth();
  let projYear = now.getFullYear();

  for (let i = 1; i <= nextMonths; i++) {
    projMonth++;
    if (projMonth > 11) { projMonth = 0; projYear++; }
    labels.push(`${monthNames[projMonth]} ${projYear}`);
    lastVal = lastVal * growth;
    forecastData.push(lastVal);
  }

  const canvasForecast = document.getElementById('forecastChart');
  if (canvasForecast && window.Chart) {
    if (window.forecastChartInstance) window.forecastChartInstance.destroy();
    const ctx = canvasForecast.getContext('2d');

    const histData = forecastData.map((v, i) => i < historyData.length ? v : null);
    const projData = forecastData.map((v, i) => i >= historyData.length - 1 ? v : null);

    let grad = ctx.createLinearGradient(0, 0, 0, 300);
    grad.addColorStop(0, gradientStop);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');

    window.forecastChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: `Histórico ${labelSuffix}`,
            data: histData,
            borderColor: '#8a8f98',
            borderWidth: 2,
            fill: false,
            tension: 0.4,
            pointRadius: 4
          },
          {
            label: `Proyección IA (+5%) ${labelSuffix}`,
            data: projData,
            borderColor: color,
            borderWidth: 3,
            borderDash: [5, 5],
            backgroundColor: grad,
            fill: true,
            tension: 0.4,
            pointRadius: 5,
            pointBackgroundColor: color
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: true, labels: { color: '#8a8f98' } } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8a8f98', maxRotation: 45 } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8a8f98' }, min: 0 }
        }
      }
    });
  }
}

// Ensure the dashboard updates once everything is loaded
document.addEventListener("DOMContentLoaded", () => {
    updateDashboard(); // In case data takes time to load, or loads immediately from cache
    
    // Add event listeners for forecast toggle buttons
    const btnGlobal = document.getElementById('btnForecastGlobal');
    const btnNomad = document.getElementById('btnForecastNomad');
    const btnSanare = document.getElementById('btnForecastSanare');
    const title = document.getElementById('forecastTitle');

    function updateForecastSelection(view, element, newTitle, activeColor, activeBg) {
        currentForecastView = view;
        [btnGlobal, btnNomad, btnSanare].forEach(b => {
            if(b) {
                b.style.background = 'transparent';
                b.style.color = 'var(--text-secondary)';
                b.style.border = '1px solid var(--text-secondary)';
            }
        });
        if(element) {
            element.style.background = activeBg;
            element.style.color = activeColor;
            element.style.border = `1px solid ${activeColor}`;
        }
        if(title) title.textContent = newTitle;
        updateDashboard();
    }

    if (btnGlobal) btnGlobal.addEventListener('click', () => updateForecastSelection('global', btnGlobal, 'Pronóstico Global', '#00ffa3', 'rgba(0, 255, 163, 0.1)'));
    if (btnNomad) btnNomad.addEventListener('click', () => updateForecastSelection('nomad', btnNomad, 'Pronóstico Nomad', '#3b82f6', 'rgba(59, 130, 246, 0.1)'));
    if (btnSanare) btnSanare.addEventListener('click', () => updateForecastSelection('sanare', btnSanare, 'Pronóstico Sanare', '#ec4899', 'rgba(236, 72, 153, 0.1)'));
    
    // Initialize default styles
    if (btnGlobal) updateForecastSelection('global', btnGlobal, 'Pronóstico Global', '#00ffa3', 'rgba(0, 255, 163, 0.1)');
    
    // Init CRM Map when CRM tab is clicked
    const navCRM = document.querySelector('[data-target="view-crm"]');
    if (navCRM) {
        navCRM.addEventListener('click', () => {
            // Small timeout to ensure the view is visible before Leaflet renders
            setTimeout(initCRMMap, 250);
        });
    }

    // Re-renderizar gráfica Nomad 2025-2026 cuando se abre el tab
    const navNomad = document.querySelector('[data-target="view-nomad"]');
    if (navNomad) {
        navNomad.addEventListener('click', () => {
            // Quitar clase 'hidden' del panel y esperar a que el CSS aplique
            const nomadPanel = document.getElementById('view-nomad');
            if (nomadPanel) nomadPanel.classList.remove('hidden');
            // Doble requestAnimationFrame asegura que el layout ya calculó dimensiones
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    renderNomadHistoryChart(nomadData);
                });
            });
        });
    }
});

// ── Búsqueda en tiempo real: CRM ─────────────────────────────────────────────
function filterCrmTable() {
  const q = (document.getElementById('crmSearch')?.value || '').toLowerCase();
  const leads = (window._allCrmLeads || []).filter(r =>
    (r.nombre + r.marca + r.kam + r.status1).toLowerCase().includes(q)
  );
  const badge = document.getElementById('crmCountBadge');
  if (badge) badge.textContent = `${leads.length} leads`;
  const body = document.getElementById('crmTableBody');
  if (!body) return;
  if (!leads.length) {
    body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#8a8f98;padding:2rem;">Sin resultados</td></tr>';
    return;
  }
  body.innerHTML = leads.map(lead => {
    const initials = lead.nombre.replace(/Dr\.?\s|Dra\.?\s/gi,'').substring(0,2).toUpperCase();
    const statusColor = lead.status1.toLowerCase().includes('activ') ? '#00ffa3'
      : lead.status1.toLowerCase().includes('seguimiento') ? '#f59e0b' : '#8a8f98';
    return `<tr>
      <td><div class="doc-info"><div class="avatar" style="background:${lead.color};color:${lead.textC};">${initials}</div> ${lead.nombre}</div></td>
      <td><span class="tag ${lead.tag}">${lead.marca}</span></td>
      <td>${lead.kam}</td>
      <td style="color:#00ffa3;font-weight:500;">${lead.monto > 0 ? formatMoney(lead.monto) : '—'}</td>
      <td><span style="font-size:0.78rem;color:${statusColor};">${lead.status1}</span></td>
    </tr>`;
  }).join('');
}

// ── Búsqueda en tiempo real: Embudo ──────────────────────────────────────────
function filterEmbudoTable() {
  const q = (document.getElementById('embudoSearch')?.value || '').toLowerCase();
  const PAID = ['Pago confirmado','Pago parcial','Anticipo recibido'];
  const rows = (window._embudoRows || []).filter(r =>
    (r.paciente + r.marca + r.kam + r.sede + r.pagoStatus + r.programacionStatus + r.tratamiento + r.servicio)
      .toLowerCase().includes(q)
  );
  const badge = document.getElementById('embudoCountBadge');
  if (badge) badge.textContent = `${rows.length} registros`;
  const body = document.getElementById('embudoDetailBody');
  if (!body) return;
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#8a8f98;padding:2rem;">Sin resultados</td></tr>';
    return;
  }
  body.innerHTML = rows.map(r => {
    const pagoColor = PAID.includes(r.pagoStatus) ? '#00ffa3'
      : r.pagoStatus === 'Pendiente de pago' ? '#f59e0b' : '#8a8f98';
    const progColor = r.programacionStatus === 'Aplicada' ? '#00ffa3'
      : ['Programada','Reprogramada'].includes(r.programacionStatus) ? '#3b82f6' : '#8a8f98';
    const marcaTag  = (r.marca||'').toUpperCase().includes('SANARE') ? 'tag-sanare' : 'tag-nomad';
    const marcaName = (r.marca||'').toUpperCase().includes('SANARE') ? 'Sanare' : 'Nomad';
    const fechaPago = r.pagoFecha ? (r.pagoFecha.seconds
      ? new Date(r.pagoFecha.seconds*1000).toLocaleDateString('es-MX')
      : new Date(r.pagoFecha).toLocaleDateString('es-MX')) : '—';
    return `<tr>
      <td style="font-weight:500;">${r.paciente || '—'}</td>
      <td><span class="tag ${marcaTag}">${marcaName}</span></td>
      <td>${r.kam || '—'}</td>
      <td>${r.sede || '—'}</td>
      <td><span style="font-size:0.78rem;color:${pagoColor};">${r.pagoStatus}</span></td>
      <td style="color:#00ffa3;font-weight:500;">${r.pagoMonto > 0 ? formatMoney(r.pagoMonto) : '—'}</td>
      <td><span style="font-size:0.78rem;color:${progColor};">${r.programacionStatus}</span></td>
      <td style="font-size:0.78rem;color:#8a8f98;">${r.tratamiento || r.servicio || '—'}</td>
      <td style="font-size:0.78rem;color:#8a8f98;">${fechaPago}</td>
    </tr>`;
  }).join('');
}

// ==========================================
// CRM PRAXIS: Mapa Interactivo + Análisis
// ==========================================
const MX_STATES = {
  "Aguascalientes":[21.8853,-102.2916],"Baja California":[30.8406,-115.2838],
  "Baja California Sur":[26.0444,-111.6661],"Campeche":[18.8048,-90.5255],
  "Coahuila":[27.0587,-101.7068],"Colima":[19.2452,-103.7241],
  "Chiapas":[16.7569,-93.1292],"Chihuahua":[28.6320,-106.0691],
  "Ciudad de México":[19.4326,-99.1332],"CDMX":[19.4326,-99.1332],
  "Durango":[24.0277,-104.6532],"Guanajuato":[21.0190,-101.2574],
  "Guerrero":[17.4392,-99.5451],"Hidalgo":[20.1011,-98.7624],
  "Jalisco":[20.6597,-103.3496],"México":[19.2921,-99.6557],
  "Estado de México":[19.2921,-99.6557],"Edomex":[19.2921,-99.6557],
  "Michoacán":[19.5665,-101.7068],"Morelos":[18.6813,-99.1013],
  "Nayarit":[21.7514,-104.8455],"Nuevo León":[25.5922,-99.9962],
  "Oaxaca":[17.0732,-96.7266],"Puebla":[19.0414,-98.2063],
  "Querétaro":[20.5888,-100.3899],"Quintana Roo":[19.1817,-88.4791],
  "San Luis Potosí":[22.1565,-100.9855],"Sinaloa":[24.8091,-107.3940],
  "Sonora":[29.2972,-110.3309],"Tabasco":[17.8409,-92.6189],
  "Tamaulipas":[24.2669,-98.8363],"Tlaxcala":[19.3182,-98.2375],
  "Veracruz":[19.1738,-96.1342],"Yucatán":[20.7099,-89.0943],
  "Zacatecas":[22.7709,-102.5832]
};

let crmMapInstance = null;
let crmMedicos = [];
let kamChartInstance = null;
let hospitalChartInstance = null;

function initCRMMap() {
  const mapEl = document.getElementById('mexicoMap');
  if (!mapEl || !window.L) return;

  // Load medicos from global JS variable (no fetch needed for file:// compatibility)
  if (!crmMedicos.length) {
    if (window.MEDICOS_DATA && window.MEDICOS_DATA.length) {
      crmMedicos = window.MEDICOS_DATA;
      window.crmMedicos = crmMedicos; // Expose globally for PDF
    } else {
      mapEl.innerHTML = '<div style="color:#8a8f98; padding:2rem; text-align:center;">⚠️ No se encontró medicos_data.js. Asegúrate de que el archivo exista en la misma carpeta.</div>';
      return;
    }
  }

  // Init map only once
  if (!crmMapInstance) {
    crmMapInstance = L.map('mexicoMap', { zoomControl: true }).setView([23.6345, -102.5528], 5);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd', maxZoom: 19
    }).addTo(crmMapInstance);
  } else {
    crmMapInstance.eachLayer(layer => {
      if (layer instanceof L.CircleMarker || layer instanceof L.Marker) {
        crmMapInstance.removeLayer(layer);
      }
    });
  }

  // Aggregate by estado
  const byState = {};
  const byKam = {};
  const byHospital = {};

  crmMedicos.forEach(m => {
    const estado = (m['Estado'] || m['estado'] || '').trim();
    const kam = (m['GERENTE/KAM'] || m['KAM'] || m['kam'] || 'Sin asignar').trim();
    const hosp = (m['Hospital'] || m['hospital'] || 'Sin hospital').trim();

    if (estado) {
      if (!byState[estado]) byState[estado] = { count: 0, kams: {}, medicos: [] };
      byState[estado].count++;
      byState[estado].kams[kam] = (byState[estado].kams[kam] || 0) + 1;
      byState[estado].medicos.push(m['Nombre'] || m['nombre'] || '');
    }
    if (kam) byKam[kam] = (byKam[kam] || 0) + 1;
    if (hosp && hosp !== 'Sin hospital') byHospital[hosp] = (byHospital[hosp] || 0) + 1;
  });

  // Merge assigned/operational data from Embudo INNVIDA
  const embudo = window._embudoData || [];
  embudo.forEach(r => {
    let estado = (r.sede || r.estado || '').trim();
    // Normalize CDMX/Edomex for aggregation consistency
    if (estado.toUpperCase() === 'CDMX') estado = 'Ciudad de México';
    if (estado.toUpperCase() === 'EDOMEX') estado = 'Estado de México';
    
    const kam = (r.kam || 'Sin asignar').trim();
    const hosp = (r.hospital || r.sede || 'Sin hospital').trim();

    if (estado) {
      if (!byState[estado]) byState[estado] = { count: 0, kams: {}, medicos: [] };
      byState[estado].count++;
      byState[estado].kams[kam] = (byState[estado].kams[kam] || 0) + 1;
    }
    if (kam && kam !== 'Sin asignar') byKam[kam] = (byKam[kam] || 0) + 1;
    if (hosp && hosp !== 'Sin hospital') byHospital[hosp] = (byHospital[hosp] || 0) + 1;
  });

  // Max count for scaling
  const maxCount = Math.max(...Object.values(byState).map(s => s.count), 1);

  // Draw circles per state
  Object.entries(byState).forEach(([estado, data]) => {
    const coords = MX_STATES[estado];
    if (!coords) return;
    
    const pct = data.count / maxCount;
    const radius = Math.max(10, Math.min(55, 10 + pct * 45));
    
    // Color based on propensity (density)
    let color;
    if (pct > 0.7) color = '#00ffa3';
    else if (pct > 0.4) color = '#3b82f6';
    else if (pct > 0.2) color = '#f59e0b';
    else color = '#64748b';

    const topKam = Object.entries(data.kams).sort((a,b) => b[1]-a[1])[0];
    const kamLabel = topKam ? `KAM líder: <strong>${topKam[0]}</strong> (${topKam[1]} médicos)` : '';
    
    const popupHtml = `
      <div style="font-family: Inter, sans-serif; min-width: 180px;">
        <div style="font-weight:700; font-size:14px; margin-bottom:6px; color:#1e293b;">${estado}</div>
        <div style="font-size:13px; color:#334155;">
          🏥 <strong>${data.count}</strong> médico${data.count !== 1 ? 's' : ''}<br/>
          ${kamLabel}
        </div>
        <div style="margin-top:8px; font-size:11px; color:#64748b; border-top:1px solid #e2e8f0; padding-top:6px;">
          Propensión: <span style="color:${color}; font-weight:600;">${Math.round(pct*100)}%</span>
        </div>
      </div>
    `;

    L.circleMarker(coords, {
      radius,
      fillColor: color,
      color: color,
      weight: 2,
      opacity: 0.9,
      fillOpacity: 0.25
    })
    .bindPopup(popupHtml)
    .addTo(crmMapInstance);

    // Label
    L.marker(coords, {
      icon: L.divIcon({
        html: `<div style="color:white;font-size:11px;font-weight:700;text-align:center;text-shadow:0 0 4px #000;">${data.count}</div>`,
        className: '',
        iconSize: [30, 20],
        iconAnchor: [15, 10]
      }),
      interactive: false
    }).addTo(crmMapInstance);
  });

  // Refresh Leaflet layout after DOM show
  setTimeout(() => { crmMapInstance.invalidateSize(); }, 100);

  // Render KAM analysis chart
  renderKAMChart(byKam);
  // Render top hospitals chart
  renderHospitalChart(byHospital);
}

function renderKAMChart(byKam) {
  const canvas = document.getElementById('kamAnalysisChart');
  if (!canvas || !window.Chart) return;
  if (kamChartInstance) kamChartInstance.destroy();

  const sorted = Object.entries(byKam).sort((a,b) => b[1]-a[1]).slice(0, 10);
  window._crmByKam = Object.fromEntries(sorted); // Expose to PDF
  const labels = sorted.map(([k]) => k);
  const values = sorted.map(([,v]) => v);
  const colors = ['#00ffa3','#3b82f6','#ec4899','#f59e0b','#8b5cf6','#06b6d4','#10b981','#f97316','#ef4444','#6366f1'];

  kamChartInstance = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Médicos por KAM',
        data: values,
        backgroundColor: colors.slice(0, labels.length),
        borderRadius: 8,
        barPercentage: 0.6
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8a8f98' } },
        y: { grid: { display: false }, ticks: { color: '#e5e7eb', font: { size: 12 } } }
      }
    }
  });
}

function renderHospitalChart(byHospital) {
  const canvas = document.getElementById('hospitalChart');
  if (!canvas || !window.Chart) return;
  if (hospitalChartInstance) hospitalChartInstance.destroy();

  const sorted = Object.entries(byHospital).sort((a,b) => b[1]-a[1]).slice(0, 8);
  const labels = sorted.map(([k]) => k.length > 25 ? k.slice(0,22)+'...' : k);
  const values = sorted.map(([,v]) => v);

  hospitalChartInstance = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: ['#00ffa3','#3b82f6','#ec4899','#f59e0b','#8b5cf6','#06b6d4','#10b981','#f97316'],
        borderWidth: 2,
        borderColor: '#0f1623'
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: '#8a8f98', boxWidth: 12 } }
      }
    }
  });
}

let seguimientoChartInstance = null;
function renderSeguimientoChart() {
  const ctx = document.getElementById('seguimientoKamsChart');
  if (!ctx) return;

  const data = window.SEGUIMIENTO_MEDICOS || [];
  if (!data.length) return;

  const kamCounts = {};
  data.forEach(row => {
    let kam = (row['KAM'] || 'Sin Asignar').trim().toUpperCase();
    kamCounts[kam] = (kamCounts[kam] || 0) + 1;
  });

  // Sort KAMs by count descending
  const sorted = Object.entries(kamCounts).sort((a, b) => b[1] - a[1]);
  const labels = sorted.map(k => k[0]);
  const values = sorted.map(k => k[1]);

  if (seguimientoChartInstance) seguimientoChartInstance.destroy();
  seguimientoChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Médicos Asignados',
        data: values,
        backgroundColor: 'rgba(59, 130, 246, 0.7)',
        borderColor: '#3b82f6',
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        y: { 
          beginAtZero: true, 
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#8a8f98' }
        },
        x: { 
          grid: { display: false },
          ticks: { color: '#8a8f98', maxRotation: 45, minRotation: 45 }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 22, 35, 0.95)',
          titleColor: '#e5e7eb',
          bodyColor: '#00ffa3',
          borderColor: 'rgba(59,130,246,0.35)',
          borderWidth: 1
        }
      }
    }
  });
}

// Call the render function once the page is fully loaded
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    renderSeguimientoChart();
  }, 1000);
});

// Real-time Listeners
dbNomad.collection("cotizaciones").onSnapshot((snap) => {
  nomadData = snap.docs.map(doc => mapNomadQuote(doc.data(), doc.id));
  window._nomadData = nomadData; // Exponer a Jane AI
  updateDashboard();
});

dbSanare.collection("cotizaciones").onSnapshot((snap) => {
  sanareData = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      fechaEmision: doc.data().fechaEmision || doc.data().createdAt,
      accepted: isAccepted(doc.data().status1 || "")
  }));
  window._sanareData = sanareData; // Exponer a Jane AI
  updateDashboard();
});

// ── Embudo INNVIDA: pagos reales y programación ──────────────────────────────
dbEmbudo.collection("seguimiento_operativo").onSnapshot((snap) => {
  embudoData = snap.docs.map(doc => {
    const d = doc.data();
    const payment    = d.payment    || {};
    const scheduling = d.scheduling || {};
    const seguimiento = d.seguimiento || {};
    return {
      id:                 doc.id,
      folio:              d.folio     || doc.id,
      marca:              d.marca     || "",
      paciente:           d.paciente  || "",
      medico:             d.medico    || scheduling.medico || "",
      kam:                d.kam       || "",
      sede:               d.sede      || scheduling.sede || "",
      sourceProject:      d.sourceProject || "",
      // Seguimiento comercial
      status1:            seguimiento.status1 || d.status1 || "Sin seguimiento",
      // Pago real
      pagoStatus:         payment.status         || "Pendiente de pago",
      pagoMonto:          Number(payment.montoPagado || 0),
      pagoFecha:          payment.fechaPago       || "",
      pagoMetodo:         payment.metodo          || "",
      pagoRegistradoPor:  payment.registradoPor   || "",
      pagoNotas:          payment.notas           || "",
      // Programación clínica
      programacionStatus: scheduling.status       || "Sin programación",
      programacionFecha:  scheduling.fechaInfusion || "",
      programacionHora:   scheduling.horaCita      || "",
      servicio:           scheduling.servicio      || "",
      ciclo:              scheduling.ciclo         || "",
      tratamiento:        scheduling.tratamiento   || "",
      diagnostico:        scheduling.diagnostico   || "",
      tipoTratamiento:    scheduling.tipoTratamiento || "",
      programadoPor:      scheduling.programadoPor || "",
      programacionNotas:  scheduling.notas         || "",
      updatedAt:          d.updatedAt              || null
    };
  });
  // Exponer a Jane AI y refrescar dashboard (Sanare usa datos del embudo)
  window._embudoData = embudoData;
  console.log(`[Embudo] ${embudoData.length} registros operativos cargados.`);
  updateDashboard();
}, (err) => {
  console.error("Error leyendo embudo-innvida:", err);
});

// ── CRM INNVIDA: Nuevos Registros y KAMs ─────────────────────────────────────
dbCrmInnvida.collection("medicos").onSnapshot((snap) => {
  crmMedicos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  window.crmMedicos = crmMedicos; // Expose to PDF generator

  // Render Nuevos Registros (Semana Actual) en la vista CRM
  const tbodyNuevos = document.getElementById('nuevosRegistrosBody');
  const badgeNuevos = document.getElementById('nuevosRegistrosBadge');
  
  if (tbodyNuevos) {
    // Filtrar/Ordenar para mostrar los más recientes arriba
    const recientes = [...crmMedicos].sort((a, b) => {
      const ta = a.createdAt?.seconds || 0;
      const tb = b.createdAt?.seconds || 0;
      return tb - ta;
    }).slice(0, 20);

    badgeNuevos.textContent = `${crmMedicos.length} altas totales`;
    
    if (!recientes.length) {
       tbodyNuevos.innerHTML = '<tr><td colspan="11" style="text-align:center; padding: 2rem; color: #8a8f98;">Sin registros recientes...</td></tr>';
    } else {
       tbodyNuevos.innerHTML = recientes.map(m => `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
          <td style="font-weight: 500;">${m.nombre || '—'}</td>
          <td style="color:#8a8f98;">${m.telefono || '—'}</td>
          <td style="color:#8a8f98; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${m.direccion || ''}">${m.direccion || '—'}</td>
          <td>${m.hospital || '—'}</td>
          <td>${m.redSocial || '—'}</td>
          <td>${m.especialidad || '—'}</td>
          <td>${m.base || '—'}</td>
          <td>${m.estado || '—'}</td>
          <td>${m.region || '—'}</td>
          <td style="color:#00ffa3;">${m.kam || m['GERENTE/KAM'] || 'Sin asignar'}</td>
          <td>
              <button class="action-btn" style="padding: 4px 12px; font-size: 0.75rem; background: rgba(59,130,246,0.1); color: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; cursor: pointer;">
                  + Seguimiento
              </button>
          </td>
        </tr>
      `).join('');
    }
  }

  console.log(`[CRM] ${crmMedicos.length} médicos/leads cargados desde CRM INNVIDA.`);
  // Re-inicializar el mapa para reflejar nuevos KAMs (si la vista CRM está activa)
  if (!document.getElementById('view-crm').classList.contains('hidden')) {
      initCRMMap();
  }
}, (err) => {
  console.error("Error leyendo crm-innvida medicos:", err);
});
