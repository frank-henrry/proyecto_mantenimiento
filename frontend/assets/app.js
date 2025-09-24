// ===== Configuración =====
const API_BASE = ""; // mismo host (FastAPI sirve también los estáticos)


// ===== Utilidades =====
async function fetchJSON(url, opts = {}) {
    const r = await fetch(API_BASE + url, opts);
    if (!r.ok) {
        const t = await r.text().catch(() => "error");
        throw new Error(t || (r.status + " " + r.statusText));
    }
    if (r.status === 204) return null;
    return await r.json();
}

function toast(msg, type = "success") {
    const wrap = document.getElementById("_toasts") || (() => { const d = document.createElement('div'); d.id = '_toasts'; d.style.position = 'fixed'; d.style.right = '16px'; d.style.bottom = '16px'; d.style.zIndex = 9999; document.body.appendChild(d); return d; })();
    const el = document.createElement('div');
    el.className = `alert alert-${type} shadow-soft`;
    el.textContent = msg;
    el.style.minWidth = '240px';
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 2000);
}


function qs(name) { return new URL(location.href).searchParams.get(name); }
function autosize(el) { el.style.height = 'auto'; el.style.height = (el.scrollHeight + 2) + 'px'; }

// ===== Inicializadores por página =====


document.addEventListener('DOMContentLoaded', () => {
    const page = document.body.dataset.page;
    if (page === 'upload') initUpload();
    if (page === 'list') initList();
    if (page === 'detail') initDetail();
    if (page === 'export') initExport();
});

// ---- Subida de PDFs ----
// ---- Subida de PDFs (nuevo) ----
async function initUpload(){
  // Tema (mismo toggle que index)
  const THEME_KEY='rev2-theme';
  function applyTheme(mode){ document.documentElement.setAttribute('data-theme', mode); localStorage.setItem(THEME_KEY, mode); }
  (function initTheme(){
    const saved = localStorage.getItem(THEME_KEY);
    if(saved){ applyTheme(saved); } else {
      const preferDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      applyTheme(preferDark? 'dark':'light');
    }
    document.body.classList.remove('theme-init');
  })();
  document.getElementById('themeToggle')?.addEventListener('click', ()=>{
    const cur = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(cur==='light'?'dark':'light');
  });
  document.getElementById('themeToggleSm')?.addEventListener('click', ()=>{
    const cur = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(cur==='light'?'dark':'light');
  });

  const input = document.getElementById('pdfFiles');
  const pickBtn = document.getElementById('pickBtn');
  const dropzone = document.getElementById('dropzone');
  const uploadBtn = document.getElementById('uploadBtn');
  const clearBtn = document.getElementById('clearBtn');
  const fileList = document.getElementById('fileList');
  const fileCount = document.getElementById('fileCount');
  const totalBar = document.getElementById('totalBar');

  let queue = [];      // [{file, li, bar, status}]
  let uploading = false;

  function fmtSize(n){
    if(n>1024*1024) return (n/1024/1024).toFixed(1)+' MB';
    if(n>1024) return (n/1024).toFixed(1)+' KB';
    return n+' B';
  }
  function updateControls(){
    fileCount.textContent = queue.length;
    uploadBtn.disabled = (queue.length===0 || uploading);
    clearBtn.disabled = (queue.length===0 || uploading);
  }
  function addFiles(files){
    const arr = Array.from(files).filter(f => f.type==='application/pdf');
    arr.forEach(f=>{
      const li = document.createElement('li');
      li.className = 'list-group-item';
      li.innerHTML = `
        <div class="file-meta">
          <span class="file-name">${f.name}</span>
          <span class="file-size">${fmtSize(f.size)}</span>
        </div>
        <div class="file-status">
          <div class="progress" style="width:180px;height:8px"><div class="progress-bar" style="width:0%"></div></div>
          <span class="badge rounded-pill text-bg-secondary">En cola</span>
        </div>
      `;
      const bar = li.querySelector('.progress-bar');
      const badge = li.querySelector('.badge');
      fileList.appendChild(li);
      queue.push({ file: f, li, bar, badge });
    });
    updateControls();
  }

  // UI events
  pickBtn.addEventListener('click', ()=> input.click());
  input.addEventListener('change', (e)=> addFiles(e.target.files));

  ;['dragenter','dragover'].forEach(ev=> dropzone.addEventListener(ev, (e)=>{ e.preventDefault(); e.stopPropagation(); dropzone.classList.add('dragover'); }));
  ;['dragleave','drop'].forEach(ev=> dropzone.addEventListener(ev, (e)=>{ e.preventDefault(); e.stopPropagation(); dropzone.classList.remove('dragover'); }));
  dropzone.addEventListener('drop', (e)=> addFiles(e.dataTransfer.files));

  clearBtn.addEventListener('click', ()=>{
    if(uploading) return;
    queue = []; fileList.innerHTML = ''; totalBar.style.width='0%'; updateControls();
  });

  uploadBtn.addEventListener('click', async ()=>{
    if(uploading || queue.length===0) return;
    uploading = true; updateControls();
    totalBar.style.width = '0%';

    let done = 0;
    for(const item of queue){
      // Subir 1 archivo usando XHR para progreso
      await new Promise((resolve) => {
        const fd = new FormData();
        fd.append('files', item.file); // endpoint acepta lista; aquí es uno por request

        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/articulos/upload-multiple');
        xhr.upload.onprogress = (e)=>{
          if(e.lengthComputable){
            const pct = Math.round(e.loaded*100/e.total);
            item.bar.style.width = pct+'%';
          }
        };
        xhr.onload = ()=>{
          if(xhr.status>=200 && xhr.status<300){
            // respuesta: array de artículos creados
            const arr = JSON.parse(xhr.responseText);
            const created = Array.isArray(arr) ? arr[0] : null;
            item.bar.style.width='100%';
            item.badge.className = 'badge rounded-pill badge-up';
            item.badge.textContent = 'Guardado';
            if(created?.id){
              const link = document.createElement('a');
              link.href = `articulo.html?id=${created.id}`;
              link.className = 'small-note';
              link.textContent = 'Abrir ficha';
              item.li.querySelector('.file-status').appendChild(link);
            }
          }else{
            item.badge.className = 'badge rounded-pill text-bg-danger';
            item.badge.textContent = 'Error';
          }
          done++;
          totalBar.style.width = Math.round(done*100/queue.length)+'%';
          resolve();
        };
        xhr.onerror = ()=>{
          item.badge.className = 'badge rounded-pill text-bg-danger';
          item.badge.textContent = 'Error';
          done++; totalBar.style.width = Math.round(done*100/queue.length)+'%';
          resolve();
        };
        xhr.send(fd);
      });
    }

    uploading = false;
    updateControls();
  });
}


// ---- Listado de artículos ----
async function initList() {
    const tbody = document.querySelector('#artTable tbody');
    const search = document.getElementById('search');
    const sortBy = document.getElementById('sortBy');


    async function load() {
        const sort = sortBy.value;
        const items = await fetchJSON(`/articulos?sort=${encodeURIComponent(sort)}`);
        render(items);
    }


    function render(items) {
        const term = (search.value || '').toLowerCase();
        tbody.innerHTML = '';
        items
            .filter(it => it.titulo.toLowerCase().includes(term))
            .forEach(it => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${it.id}</td>
                    <td>
                    <div class="fw-semibold">${it.titulo}</div>
                    <div class="text-muted small">${it.pdf_path}</div>
                    </td>
                    <td>
                    <a class="btn btn-sm btn-outline-primary" href="articulo.html?id=${it.id}">Abrir</a>
                    </td>`;
                tbody.appendChild(tr);
            });
    }


    search.addEventListener('input', load);
    sortBy.addEventListener('change', load);
    load();
}

// ---- Detalle de artículo ----
async function initDetail() {
    const id = parseInt(qs('id'));
    if (!id) { toast('Falta id', 'danger'); return; }


    const art = await fetchJSON(`/articulos/${id}`);
    document.getElementById('artTitle').textContent = art.titulo;
    document.getElementById('artPdf').textContent = art.pdf_path;
    const openPdf = document.getElementById('openPdf');
    openPdf.href = art.pdf_path.startsWith('/') ? art.pdf_path : ('/' + art.pdf_path);

    // Resumen
    const txtResumen = document.getElementById('txtResumen');
    const resumenInfo = document.getElementById('resumenInfo');
    txtResumen.value = art.resumen || '';
    autosize(txtResumen);
    resumenInfo.textContent = `${(txtResumen.value.trim().match(/\S+/g) || []).length} palabras`;
    txtResumen.addEventListener('input', () => {
        autosize(txtResumen);
        resumenInfo.textContent = `${(txtResumen.value.trim().match(/\S+/g) || []).length} palabras`;
    });
    document.getElementById('btnSaveResumen').addEventListener('click', async () => {
        const fd = new FormData(); fd.append('resumen', txtResumen.value);
        try { await fetchJSON(`/articulos/${id}`, { method: 'PUT', body: fd }); toast('Resumen guardado'); } catch (e) { toast('Error al guardar resumen', 'danger'); }
    });

    // Preguntas + opciones
    const preguntas = await fetchJSON('/preguntas');
    const existentes = await fetchJSON(`/articulos/${id}/respuestas`); // [{pregunta_id, respuesta, respuestas_categoricas, impacto, valoracion}]
    const byPid = {}; existentes.forEach(r => byPid[r.pregunta_id] = r);


    const qNav = document.getElementById('qNav');
    const qWrap = document.getElementById('qWrap');
    const qSearch = document.getElementById('qSearch');


    function answered(pid) {
        const ta = document.getElementById(`ans_${pid}`);
        return !!(ta && ta.value.trim().length);
    }
    function updateProgress() {
        const total = preguntas.length;
        const ok = preguntas.filter(q => answered(q.id)).length;
        document.getElementById('progressText').textContent = `${ok}/${total}`;
        document.getElementById('progressBar').style.width = (total ? Math.round(ok * 100 / total) : 0) + '%';
    }

    // Construir tarjetas
    for (const q of preguntas) {
        // sidebar item
        const a = document.createElement('a');
        a.href = `#q_${q.id}`; a.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';
        a.innerHTML = `<span>${q.orden}. ${q.etiqueta}</span><span class="badge rounded-pill badge-miss" id="badge_${q.id}">·</span>`;
        qNav.appendChild(a);


        // opciones categóricas
        const opts = await fetchJSON(`/preguntas/${q.id}/opciones`);


        // card
        const card = document.createElement('div');
        card.className = 'card shadow-soft mb-3';
        card.id = `q_${q.id}`;
        const ex = byPid[q.id] || {};
        const valor = ex.valoracion || '';


        card.innerHTML = `
            <div class="card-body">
            <div class="d-flex align-items-center justify-content-between mb-2">
            <h6 class="mb-0">${q.orden}. ${q.etiqueta}</h6>
            <div class="d-flex gap-2">
            <button class="btn btn-sm btn-outline-secondary" data-prev="${q.id}">Anterior</button>
            <button class="btn btn-sm btn-outline-secondary" data-next="${q.id}">Siguiente</button>
            <button class="btn btn-sm btn-outline-primary" data-save-one="${q.id}">Guardar</button>
            </div>
            </div>
            <div class="mb-2">
            <label class="form-label">Respuesta (explicación)</label>
            <textarea class="form-control autosize" id="ans_${q.id}" rows="3" placeholder="Explica tu elección...">${ex.respuesta || ''}</textarea>
            </div>
            <div class="mb-2">
            <label class="form-label">Opciones (selección múltiple)</label>
            <div class="checkbox-grid" id="chk_${q.id}"></div>
            </div>
            <div class="row g-2">
            <div class="col-md-8">
            <label class="form-label">Impacto</label>
            <textarea class="form-control autosize" id="imp_${q.id}" rows="2" placeholder="Describe el impacto...">${ex.impacto || ''}</textarea>
            </div>
            <div class="col-md-4">
            <label class="form-label">Valoración</label>
            <select class="form-select" id="val_${q.id}">
            <option value="">—</option>
            <option ${valor == 1 ? 'selected' : ''} value="1">1</option>
            <option ${valor == 2 ? 'selected' : ''} value="2">2</option>
            <option ${valor == 3 ? 'selected' : ''} value="3">3</option>
            <option ${valor == 4 ? 'selected' : ''} value="4">4</option>
            <option ${valor == 5 ? 'selected' : ''} value="5">5</option>
            </select>
            </div>
            </div>
            </div>`;


        qWrap.appendChild(card);

        // pintar checkboxes
        const grid = document.getElementById(`chk_${q.id}`);
        const selected = new Set(ex.respuestas_categoricas || []);
        opts.sort((a, b) => a.orden - b.orden).forEach(op => {
            const id = `p${q.id}_opt${op.id}`;
            const div = document.createElement('div');
            div.className = 'form-check';
            div.innerHTML = `<input class="form-check-input" type="checkbox" id="${id}" value="${op.opcion}">
                <label class="form-check-label" for="${id}">${op.opcion}</label>`;
            grid.appendChild(div);
            if (selected.has(op.opcion)) div.querySelector('input').checked = true;
        });


        // autosize
        card.querySelectorAll('textarea.autosize').forEach(el => {
            autosize(el); el.addEventListener('input', () => autosize(el));
        });
    }

    // Búsqueda en sidebar
    qSearch.addEventListener('input', () => {
        const term = qSearch.value.toLowerCase();
        document.querySelectorAll('#qNav .list-group-item').forEach(a => {
            const txt = a.textContent.toLowerCase();
            a.style.display = txt.includes(term) ? '' : 'none';
        });
    });

    // Guardar una pregunta
    document.addEventListener('click', async (e) => {
        const s1 = e.target.closest('[data-save-one]');
        const n1 = e.target.closest('[data-next]');
        const p1 = e.target.closest('[data-prev]');


        if (s1) {
            const pid = parseInt(s1.getAttribute('data-save-one'));
            await saveOne(pid);
            updateProgress();
            return;
        }
        if (n1) {
            const pid = parseInt(n1.getAttribute('data-next'));
            await saveOne(pid);
            jump(+1, pid);
            return;
        }
        if (p1) {
            const pid = parseInt(p1.getAttribute('data-prev'));
            await saveOne(pid);
            jump(-1, pid);
            return;
        }
    });

    async function saveOne(pid) {
        const ans = document.getElementById(`ans_${pid}`).value;
        const imp = document.getElementById(`imp_${pid}`).value;
        const val = document.getElementById(`val_${pid}`).value;
        const chk = Array.from(document.querySelectorAll(`#chk_${pid} input[type=checkbox]:checked`)).map(i => i.value);
        if (!ans.trim()) { toast('Completa la respuesta explicada', 'warning'); return; }
        const payload = [{ pregunta_id: pid, respuesta: ans, respuestas_categoricas: chk, impacto: imp, valoracion: val ? parseInt(val) : null }];
        try {
            await fetchJSON(`/articulos/${id}/respuestas`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            document.getElementById(`badge_${pid}`).classList.remove('badge-miss');
            document.getElementById(`badge_${pid}`).classList.add('badge-ok');
            document.getElementById(`badge_${pid}`).textContent = '✓';
            toast('Respuesta guardada');
        } catch (e) { toast('Error al guardar: ' + e.message, 'danger'); }
    }

    function jump(delta, pid) {
        const idx = preguntas.findIndex(q => q.id === pid);
        const next = preguntas[idx + delta];
        if (next) { document.getElementById(`q_${next.id}`).scrollIntoView({ behavior: 'smooth' }); }
    }

    // Guardar todas
    document.getElementById('btnSaveAll').addEventListener('click', async () => {
        const payload = preguntas.map(q => {
            const ans = document.getElementById(`ans_${q.id}`).value;
            if (!ans.trim()) return null;
            const imp = document.getElementById(`imp_${q.id}`).value;
            const val = document.getElementById(`val_${q.id}`).value;
            const chk = Array.from(document.querySelectorAll(`#chk_${q.id} input[type=checkbox]:checked`)).map(i => i.value);
            return { pregunta_id: q.id, respuesta: ans, respuestas_categoricas: chk, impacto: imp, valoracion: val ? parseInt(val) : null };
        }).filter(Boolean);
        if (payload.length === 0) { toast('Nada que guardar', 'warning'); return; }
        try { await fetchJSON(`/articulos/${id}/respuestas`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); toast('Todas las respuestas guardadas'); updateProgress(); }
        catch (e) { toast('Error: ' + e.message, 'danger'); }
    });


    updateProgress();
}
// ---- Exportar ----
async function initExport() {
    // (Opcional) podríamos mostrar una previsualización si existe endpoint JSON
}