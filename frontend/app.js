// Detecta entorno: usa localhost en dev y /api en producción (Render)
const API = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:5000/api'
  : '/api';

let state = { page: 1, page_size: 10, pages: 1 };

function td(x){ return (x===null||x===undefined||x==='') ? '—' : x; }
function riskBadge(r){
  const t=(r||'').toLowerCase();
  if(t.includes('hipoglucemia')) return '<span class="badge hypo">Alto (hipoglucemia)</span>';
  if(t.includes('bajo')) return '<span class="badge low">Bajo</span>';
  if(t.includes('moderado')) return '<span class="badge mid">Moderado</span>';
  if(t.includes('alto')) return '<span class="badge high">Alto</span>';
  return '—';
}
function formatDate(iso){ try{return new Date(iso).toLocaleString();}catch{return '—';} }
function comorb(r){
  const a=[];
  if(r.has_hypertension)a.push('HTA');
  if(r.has_obesity)a.push('Obes');
  if(r.has_dyslipidemia)a.push('Dislip');
  if(r.has_ckd)a.push('ERC');
  if(r.has_cvd)a.push('ECV');
  if(r.has_copd_asthma)a.push('EPOC/Asma');
  if(r.has_depression)a.push('Dep');
  return a.join(', ')||'—';
}
function meds(r){
  const a=[];
  if(r.med_htn)a.push('Antihip.');
  if(r.med_dm)a.push('Antidiab.');
  if(r.med_insulin)a.push('Insulina');
  if(r.med_metformin)a.push('Metf.');
  if(r.med_statins)a.push('Estat.');
  if(r.med_antiplatelet)a.push('Antiagreg.');
  if(r.med_other)a.push(r.med_other);
  return a.join(', ')||'—';
}

async function fetchJSON(url){
  const res = await fetch(url);
  if(!res.ok){
    let msg = '';
    try { const j = await res.json(); msg = j.error || JSON.stringify(j); }
    catch { msg = await res.text(); }
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return await res.json();
}

async function loadPatients(){
  const risk=document.getElementById('riskFilter').value;
  const name=document.getElementById('nameSearch').value.trim();
  const ps=document.getElementById('pageSize').value;
  state.page_size=Number(ps);
  const params=new URLSearchParams({page:state.page,page_size:state.page_size});
  if(risk) params.set('risk',risk);
  if(name) params.set('name',name);
  const data=await fetchJSON(`${API}/patients?${params.toString()}`);
  state.pages=data.pages; state.page=data.page;
  renderTable(data.items);
  document.getElementById('pageInfo').textContent=`Página ${state.page} de ${state.pages} (total ${data.total})`;
}

function renderTable(items){
  const tbody=document.querySelector('#patientsTable tbody');
  tbody.innerHTML='';
  for(const r of items){
    const tr=document.createElement('tr');
    const pa=(r.systolic&&r.diastolic)?`${r.systolic}/${r.diastolic} (${r.htn_stage||'—'})`:'—';
    const imc=r.bmi?`${r.bmi} (${r.bmi_cat||'—'})`:'—';
    tr.innerHTML=`
      <td>${td(r.id)}</td>
      <td>${formatDate(r.created_at)}</td>
      <td>${td(r.name)}</td>
      <td>${td(r.age)}</td>
      <td>${td(r.sex)}</td>
      <td>${td(r.schooling)}</td>
      <td>${r.glucose_mgdl?.toFixed?r.glucose_mgdl.toFixed(1):r.glucose_mgdl}</td>
      <td>${riskBadge(r.risk)}</td>
      <td>${pa}</td>
      <td>${imc}</td>
      <td>${r.has_hypertension?'Sí':'No'}</td>
      <td>${r.has_obesity?'Sí':'No'}</td>
      <td>${r.smoker?'Sí':'No'}</td>
      <td>${td(r.physical_activity)}</td>
      <td>${comorb(r)}</td>
      <td>${meds(r)}</td>
      <td>${td(r.notes)}</td>
      <td>
        <button class="secondary edit" data-id="${r.id}">Editar</button>
        <button class="secondary del" data-id="${r.id}">Eliminar</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll('button.del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      if(!confirm(`¿Eliminar #${id}?`)) return;
      await fetch(`${API}/patients/${id}`, { method: 'DELETE' });
      await loadPatients(); await loadStats();
    });
  });
  tbody.querySelectorAll('button.edit').forEach(btn => btn.addEventListener('click', () => openEdit(btn.getAttribute('data-id'))));
}

async function openEdit(id){
  const d = await fetchJSON(`${API}/patients/${id}`);
  const dlg = document.getElementById('editDialog');
  const form = document.getElementById('editForm');
  form.reset();
  for(const k of ['id','name','age','sex','schooling','glucose_mgdl','systolic','diastolic','weight_kg','height_cm']){
    const el = form.querySelector(`[name="${k}"]`);
    if(el) el.value = d[k] ?? '';
  }
  dlg.showModal();
  document.getElementById('saveEdit').onclick = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = {};
    ['name','age','sex','schooling','glucose_mgdl','systolic','diastolic','weight_kg','height_cm'].forEach(k => {
      const v = fd.get(k);
      if(v !== '') payload[k] = isNaN(Number(v)) || k==='sex' || k==='schooling' || k==='name' ? v : Number(v);
    });
    const id = fd.get('id');
    await fetch(`${API}/patients/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    dlg.close();
    await loadPatients(); await loadStats();
  };
}

async function loadStats(){
  const s = await fetchJSON(`${API}/stats`);
  const box = document.getElementById('statsBox');
  box.innerHTML = '';
  const mk = (t,v)=>`<div class="stat"><div style="color:var(--muted);font-size:.85rem">${t}</div><div style="font-size:1.2rem;font-weight:700">${v}</div></div>`;
  box.insertAdjacentHTML('beforeend', mk('Total', s.total));
  box.insertAdjacentHTML('beforeend', mk('Con HTA', s.with_hypertension));
  box.insertAdjacentHTML('beforeend', mk('Con Obesidad', s.with_obesity));
  Object.entries(s.by_risk||{}).forEach(([k,v])=>box.insertAdjacentHTML('beforeend', mk(`Riesgo: ${k}`, v)));
  drawRiskChart(s.by_risk||{});
}

function drawRiskChart(byRisk){
  const cvs = document.getElementById('riskChart');
  const ctx = cvs.getContext('2d');
  ctx.clearRect(0,0,cvs.width,cvs.height);
  const labels = Object.keys(byRisk), values = Object.values(byRisk);
  const max = Math.max(1, ...values);
  const pad=40, w=cvs.width-pad*2, h=cvs.height-pad*2, space = labels.length? w/labels.length: 0, barW = space*0.6;
  ctx.font='12px system-ui'; ctx.strokeStyle='#94a3b8';
  ctx.beginPath(); ctx.moveTo(pad,pad); ctx.lineTo(pad,pad+h); ctx.lineTo(pad+w,pad+h); ctx.stroke();
  labels.forEach((lab,i)=>{
    const x = pad + i*space + (space-barW)/2;
    const bh = (values[i]/max)*h, y = pad+h-bh;
    ctx.fillStyle= i%2 ? '#38bdf8' : '#22c55e';
    ctx.fillRect(x,y,barW,bh);
    ctx.fillStyle='#0f172a';
    ctx.fillText(lab, x, pad+h+15);
    ctx.fillText(values[i]??0, x, y-5);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // filters
  document.getElementById('riskFilter').addEventListener('change', ()=>{ state.page=1; loadPatients(); });
  document.getElementById('nameSearch').addEventListener('input', ()=>{ clearTimeout(window.__t); window.__t = setTimeout(()=>{ state.page=1; loadPatients(); }, 250); });
  document.getElementById('pageSize').addEventListener('change', ()=>{ state.page=1; loadPatients(); });
  document.getElementById('prevPage').addEventListener('click', ()=>{ if(state.page>1){ state.page--; loadPatients(); } });
  document.getElementById('nextPage').addEventListener('click', ()=>{ if(state.page<state.pages){ state.page++; loadPatients(); } });

  // exports
  document.getElementById('exportCsv').addEventListener('click', ()=> window.open(`${API}/export/csv`, '_blank'));
  document.getElementById('exportXlsx').addEventListener('click', ()=> window.open(`${API}/export/xlsx`, '_blank'));
  document.getElementById('exportPdf').addEventListener('click', ()=> window.open(`${API}/export/pdf`, '_blank'));

  // create
  document.getElementById('patientForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    // Normalize types
    ['age','glucose_mgdl','systolic','diastolic','weight_kg','height_cm'].forEach(k=>{
      if(payload[k]==='') delete payload[k]; else payload[k]=Number(payload[k]);
    });
    ['has_hypertension','has_obesity','has_dyslipidemia','has_ckd','has_cvd','has_copd_asthma','has_depression','med_htn','med_dm','med_insulin','med_metformin','med_statins','med_antiplatelet']
      .forEach(k=> payload[k]= fd.get(k)==='on');
    payload['smoker'] = fd.get('smoker')==='1';

    try {
      const res = await fetch(`${API}/patients`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      if(!res.ok){
        let msg = '';
        try { const err = await res.json(); msg = err.error || JSON.stringify(err); }
        catch { msg = await res.text(); }
        alert('Error al guardar: ' + msg);
        return;
      }
      e.target.reset();
      await loadPatients(); await loadStats();
      alert('Paciente guardado correctamente ✅');
    } catch (err) {
      alert('Error de red: ' + err.message);
      console.error(err);
    }
  });

  loadPatients(); loadStats();
});
