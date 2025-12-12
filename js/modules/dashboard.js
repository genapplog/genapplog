/**
 * ARQUIVO: js/modules/dashboard.js
 * DESCRIÇÃO: Dashboard Operacional, Relatórios, Impressão e Modo TV (Wallboard).
 */
import { safeBind, showToast, printDocument } from '../utils.js';
// Usamos a versão UMD (que já contém todas as dependências) e pegamos a global window.Chart
import 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
const Chart = window.Chart;

// --- ESTADO GERAL ---

// --- ESTADO GERAL ---
let localAllData = [];

// Instâncias de Gráficos (Dashboard Normal)
let chartTypeInstance = null;
let chartLocalInstance = null;
let chartCausadorInstance = null;
let chartIdentificadorInstance = null;

// Instâncias de Gráficos (Modo TV)
let tvChartTypeInstance = null;
let tvChartLocalInstance = null;
let tvChartCausadorInstance = null;
let tvChartIdentificadorInstance = null;
let tvClockInterval = null;

// =========================================================
// INICIALIZAÇÃO
// =========================================================
export function initDashboard() {
    console.log("Iniciando Módulo Dashboard...");

    // Filtros de Data (Dashboard Normal)
    safeBind('btn-dash-filter-apply', 'click', () => applyDashboardFilters());
    safeBind('btn-dash-filter-clear', 'click', () => { 
        const i1 = document.getElementById('dash-filter-start');
        const i2 = document.getElementById('dash-filter-end');
        if(i1) i1.value = ''; if(i2) i2.value = '';
        applyDashboardFilters(); 
    });

    // Exportação
    safeBind('btn-dash-export', 'click', exportToXlsx);
    safeBind('btn-dash-export-pallet', 'click', exportPalletReqToXlsx);
    
    // Busca na tabela de histórico
    safeBind('history-search-input', 'input', () => renderHistoryTable());
    safeBind('history-search-clear', 'click', () => { 
        const i = document.getElementById('history-search-input'); 
        if(i){ i.value=''; renderHistoryTable(); } 
    });

    // Modo TV
    safeBind('btn-exit-tv', 'click', exitTVMode);
}

// Chamado pelo rnc.js sempre que o banco de dados muda
export function updateDashboardView(allData) {
    localAllData = allData;
    
    // Atualiza Dashboard Normal
    applyDashboardFilters(); 
    
    // Se a TV estiver ligada, atualiza ela também em tempo real
    const tvEl = document.getElementById('tv-mode');
    if (tvEl && !tvEl.classList.contains('hidden')) {
        updateTVView();
    }
}

// =========================================================
// MODO TV (WALLBOARD)
// =========================================================

// Chamado pelo app.js (Menu)
export function startTVMode() {
    document.getElementById('tv-mode').classList.remove('hidden');
    
    // Tenta Fullscreen
    const elem = document.documentElement;
    if (elem.requestFullscreen) { elem.requestFullscreen().catch(console.log); }

    startClock();
    updateTVView();
}

function exitTVMode() {
    document.getElementById('tv-mode').classList.add('hidden');
    if (document.exitFullscreen && document.fullscreenElement) { document.exitFullscreen(); }
    if (tvClockInterval) clearInterval(tvClockInterval);
}

function startClock() {
    const updateTime = () => {
        const now = new Date();
        const elTime = document.getElementById('tv-clock');
        const elDate = document.getElementById('tv-date');
        
        if(elTime) elTime.innerText = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        if(elDate) {
            const d = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
            elDate.innerText = d.charAt(0).toUpperCase() + d.slice(1);
        }
    };
    updateTime();
    if(tvClockInterval) clearInterval(tvClockInterval);
    tvClockInterval = setInterval(updateTime, 1000);
}

function updateTVView() {
    // FILTRO TV: Apenas Ocorrências Concluídas de HOJE
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const tvData = localAllData.filter(d => {
        return d.type !== 'pallet_label_request' && 
               d.status === 'concluido' &&
               d.jsDate >= today;
    });

    // --- 1. KPIs ---
    document.getElementById('tv-kpi-total').innerText = tvData.length;
    
    const elLast = document.getElementById('tv-kpi-last');
    elLast.innerText = tvData.length > 0 
        ? tvData[0].jsDate.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}) 
        : "-";

    // --- 2. LISTA RECENTE ---
    const tbody = document.getElementById('tv-list-tbody');
    tbody.innerHTML = '';
    const recent = tvData.slice(0, 8); // Mostra até 8 linhas
    
    if (recent.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="p-6 text-center text-slate-500 text-xl">Aguardando registros hoje...</td></tr>';
    } else {
        recent.forEach(d => {
            const tr = document.createElement('tr');
            tr.className = "border-b border-slate-800/50";
            tr.innerHTML = `
                <td class="p-3 text-slate-400 font-mono text-base">${d.jsDate.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</td>
                <td class="p-3 text-white font-bold text-base">${d.tipo}</td>
                <td class="p-3 text-right text-indigo-400 font-mono text-base truncate max-w-[120px]">${d.embarque || d.nf}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    // --- 3. DADOS PARA GRÁFICOS ---
    let types = { FALTA: 0, SOBRA: 0, AVARIA: 0, FALTA_INTERNA: 0 };
    let locals = { ARMAZENAGEM: 0, ESTOQUE: 0, CHECKOUT: 0, SEPARAÇÃO: 0 }; 
    let causadores = {}, identificadores = {};

    tvData.forEach(d => {
        if(types[d.tipo] !== undefined) types[d.tipo]++;
        if(locals[d.local] !== undefined) locals[d.local]++;
        
        const c = (d.infrator || 'N/A').toUpperCase();
        causadores[c] = (causadores[c] || 0) + 1;
        
        const i = (d.ass_colab || 'N/A').toUpperCase();
        identificadores[i] = (identificadores[i] || 0) + 1;
    });

    // KPI Tipo mais frequente
    let maxType = "-", maxVal = -1; 
    for(const [k, v] of Object.entries(types)) if(v > maxVal && v > 0) { maxVal = v; maxType = k; }
    document.getElementById('tv-kpi-type').innerText = maxType;

    // --- 4. RENDERIZAÇÃO DOS GRÁFICOS TV ---
    
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
            x: { grid: { color: '#334155' }, ticks: { color: '#cbd5e1' } },
            y: { grid: { display: false }, ticks: { color: '#fff', font: { weight: 'bold' } } }
        }
    };

    // A) CHART TIPO (Rosca)
    const ctxType = document.getElementById('tvChartType');
    if (ctxType) {
        if (tvChartTypeInstance) tvChartTypeInstance.destroy();
        tvChartTypeInstance = new Chart(ctxType, {
            type: 'doughnut',
            data: {
                labels: ['Falta', 'Sobra', 'Avaria', 'Interna'],
                datasets: [{
                    data: [types.FALTA, types.SOBRA, types.AVARIA, types.FALTA_INTERNA],
                    backgroundColor: ['#ef4444', '#3b82f6', '#f59e0b', '#a855f7'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'right', labels: { color: '#fff', font: { size: 12 }, padding: 15 } } }
            }
        });
    }

    // B) CHART LOCAL (Barras)
    const ctxLocal = document.getElementById('tvChartLocal');
    if (ctxLocal) {
        if (tvChartLocalInstance) tvChartLocalInstance.destroy();
        tvChartLocalInstance = new Chart(ctxLocal, {
            type: 'bar',
            data: {
                labels: ['Armaz.', 'Estoque', 'Chk', 'Sep.'],
                datasets: [{ data: [locals.ARMAZENAGEM, locals.ESTOQUE, locals.CHECKOUT, locals.SEPARAÇÃO], backgroundColor: '#0ea5e9', borderRadius: 6 }]
            },
            options: commonOptions
        });
    }

    // C) CHART CAUSADOR (Top 5 Horizontal)
    const sortedCaus = Object.entries(causadores).sort((a,b) => b[1] - a[1]).slice(0, 5);
    const ctxCaus = document.getElementById('tvChartCausador');
    if (ctxCaus) {
        if (tvChartCausadorInstance) tvChartCausadorInstance.destroy();
        tvChartCausadorInstance = new Chart(ctxCaus, {
            type: 'bar',
            data: { labels: sortedCaus.map(i => i[0]), datasets: [{ data: sortedCaus.map(i => i[1]), backgroundColor: '#f43f5e', borderRadius: 6 }] },
            options: { ...commonOptions, indexAxis: 'y' }
        });
    }

    // D) CHART IDENTIFICADOR (Top 5 Horizontal)
    const sortedIdent = Object.entries(identificadores).sort((a,b) => b[1] - a[1]).slice(0, 5);
    const ctxIdent = document.getElementById('tvChartIdentificador');
    if (ctxIdent) {
        if (tvChartIdentificadorInstance) tvChartIdentificadorInstance.destroy();
        tvChartIdentificadorInstance = new Chart(ctxIdent, {
            type: 'bar',
            data: { labels: sortedIdent.map(i => i[0]), datasets: [{ data: sortedIdent.map(i => i[1]), backgroundColor: '#10b981', borderRadius: 6 }] },
            options: { ...commonOptions, indexAxis: 'y' }
        });
    }
}

// =========================================================
// DASHBOARD PADRÃO (FILTROS E LÓGICA ANTIGA)
// =========================================================

function applyDashboardFilters() {
    const iStart = document.getElementById('dash-filter-start'); 
    const iEnd = document.getElementById('dash-filter-end');
    if(!iStart || !iEnd) return;

    const startVal = iStart.value; 
    const endVal = iEnd.value;
    let startDate = startVal ? new Date(startVal + 'T00:00:00') : null; 
    let endDate = endVal ? new Date(endVal + 'T23:59:59') : null;
    
    const onlyRNC = localAllData.filter(d => d.type !== 'pallet_label_request' && d.status === 'concluido');

    const filteredRNC = onlyRNC.filter(d => { 
        if(startDate && d.jsDate < startDate) return false; 
        if(endDate && d.jsDate > endDate) return false; 
        return true; 
    });
    
    updateChartsAndStats(filteredRNC);
    renderHistoryTable(filteredRNC);
}

function updateChartsAndStats(data) {
    let total = data.length; 
    let types = { FALTA: 0, SOBRA: 0, AVARIA: 0, FALTA_INTERNA: 0 }; 
    let locals = { ARMAZENAGEM: 0, ESTOQUE: 0, CHECKOUT: 0, SEPARAÇÃO: 0 }; 
    let causadores = {}, identificadores = {};
    
    data.forEach(d => { 
        if(types[d.tipo] !== undefined) types[d.tipo]++; 
        if(locals[d.local] !== undefined) locals[d.local]++; 
        const nmCausador = (d.infrator || 'Não Informado').trim().toUpperCase(); 
        if(nmCausador) causadores[nmCausador] = (causadores[nmCausador] || 0) + 1; 
        const nmIdentificador = (d.ass_colab || 'Não Informado').trim().toUpperCase(); 
        if(nmIdentificador) identificadores[nmIdentificador] = (identificadores[nmIdentificador] || 0) + 1; 
    });

    const elTotal = document.getElementById('dash-total-oc'); if(elTotal) elTotal.innerText = total; 
    const elDate = document.getElementById('dash-last-date'); if(elDate) elDate.innerText = (total > 0 && data[0].jsDate) ? data[0].jsDate.toLocaleDateString('pt-BR') : "-";
    
    let maxType = "-", maxVal = -1; for(const [k, v] of Object.entries(types)) if(v > maxVal && v > 0) { maxVal = v; maxType = k; }
    const elType = document.getElementById('dash-top-type'); if(elType) elType.innerText = maxType;

    // Helper Gráfico Padrão
    const createOrUpdateChart = (canvasId, config, currentInstance) => { 
        const ctx = document.getElementById(canvasId); 
        if (!ctx) return null; 
        if (currentInstance) currentInstance.destroy(); 
        return new Chart(ctx, config); 
    };

    // 1. Tipo
    chartTypeInstance = createOrUpdateChart('chartOcType', { 
        type: 'doughnut', 
        data: { labels: ['Falta', 'Sobra', 'Avaria', 'Falta Interna'], datasets: [{ data: [types.FALTA, types.SOBRA, types.AVARIA, types.FALTA_INTERNA], backgroundColor: ['#ef4444', '#3b82f6', '#f59e0b', '#a855f7'], borderWidth: 0, borderRadius: 4 }] }, 
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'bottom', labels: { color: '#cbd5e1', usePointStyle: true, boxWidth: 8, padding: 20, font: { size: 11 } } } }, layout: { padding: { bottom: 10 } } } 
    }, chartTypeInstance);
    
    // 2. Local
    chartLocalInstance = createOrUpdateChart('chartOcLocal', { 
        type: 'bar', 
        data: { labels: ['Armazenagem', 'Estoque', 'Checkout', 'Separação'], datasets: [{ label: 'Qtd', data: [locals.ARMAZENAGEM, locals.ESTOQUE, locals.CHECKOUT, locals.SEPARAÇÃO], backgroundColor: '#6366f1', borderWidth: 0, borderRadius: 4 }] }, 
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: '#334155' }, ticks: { color: '#cbd5e1' } }, x: { grid: { display: false }, ticks: { color: '#cbd5e1' } } } } 
    }, chartLocalInstance);
    
    // 3. Causador
    const sCaus = Object.entries(causadores).sort((a, b) => b[1] - a[1]).slice(0, 10);
    chartCausadorInstance = createOrUpdateChart('chartOcCausador', { 
        type: 'bar', data: { labels: sCaus.map(i=>i[0]), datasets: [{ data: sCaus.map(i=>i[1]), backgroundColor: '#f43f5e', borderRadius: 4, barThickness: 20 }] }, 
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, grid: { color: '#334155' }, ticks: { color: '#cbd5e1', stepSize: 1 } }, y: { grid: { display: false }, ticks: { color: '#cbd5e1', font: { size: 10 } } } } } 
    }, chartCausadorInstance);
    
    // 4. Identificador
    const sIdent = Object.entries(identificadores).sort((a, b) => b[1] - a[1]).slice(0, 10);
    chartIdentificadorInstance = createOrUpdateChart('chartOcIdentificador', { 
        type: 'bar', data: { labels: sIdent.map(i=>i[0]), datasets: [{ data: sIdent.map(i=>i[1]), backgroundColor: '#10b981', borderRadius: 4, barThickness: 20 }] }, 
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, grid: { color: '#334155' }, ticks: { color: '#cbd5e1', stepSize: 1 } }, y: { grid: { display: false }, ticks: { color: '#cbd5e1', font: { size: 10 } } } } } 
    }, chartIdentificadorInstance);
}

function renderHistoryTable(dataToRender) {
    const tbody = document.getElementById('history-list-tbody'); 
    const searchInput = document.getElementById('history-search-input'); 
    const clearBtn = document.getElementById('history-search-clear'); 
    if (!tbody) return;

    let sourceData = dataToRender || localAllData.filter(d => d.type !== 'pallet_label_request' && d.status === 'concluido');
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : "";
    if(clearBtn) clearBtn.classList.toggle('hidden', searchTerm === '');

    const list = sourceData.filter(item => { 
        if (!searchTerm) return true; 
        const combined = (item.nf||'') + (item.embarque||'') + (item.tipo||'');
        return combined.toLowerCase().includes(searchTerm);
    });

    tbody.innerHTML = '';
    if (list.length === 0) { tbody.innerHTML = '<tr><td colspan="4" class="px-4 py-8 text-center text-slate-500 italic">Nenhum registro encontrado.</td></tr>'; return; }
    
    const truncatedList = list.slice(0, 10);
    truncatedList.forEach(item => {
        const tr = document.createElement('tr'); 
        tr.className = "border-b border-slate-700 hover:bg-slate-750 transition-colors";
        const displayNF = item.nf ? item.nf : '-';
        let statusDot = item.status === 'concluido' ? '<span class="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-2"></span>' : '<span class="inline-block w-2 h-2 rounded-full bg-amber-500 mr-2"></span>';

        tr.innerHTML = `
            <td class="px-4 py-3 font-mono text-slate-300 text-xs">${statusDot}${item.jsDate.toLocaleDateString('pt-BR')}</td>
            <td class="px-4 py-3 text-white font-medium text-sm">${item.embarque || '-'}<br><span class="text-slate-500 text-[10px] font-normal">${displayNF}</span></td>
            <td class="px-4 py-3 text-slate-300 text-xs">${item.tipo}</td>
            <td class="px-4 py-3 text-right">
                <button class="text-slate-400 hover:text-white bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded transition btn-print-history flex items-center gap-2 ml-auto text-xs" data-id="${item.id}">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                    Imprimir
                </button>
            </td>`;
        tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.btn-print-history').forEach(btn => btn.addEventListener('click', (e) => printRncReport(e.currentTarget.dataset.id)));
}

function exportToXlsx() {
    const iStart = document.getElementById('dash-filter-start'); 
    const iEnd = document.getElementById('dash-filter-end');
    let startDate, endDate;
    const isDefaultFilter = !iStart.value && !iEnd.value;

    if (iStart.value) { startDate = new Date(iStart.value + 'T00:00:00'); } 
    else { startDate = new Date(); startDate.setDate(startDate.getDate() - 30); startDate.setHours(0,0,0,0); }

    if (iEnd.value) { endDate = new Date(iEnd.value + 'T23:59:59'); } 
    else { endDate = new Date(); endDate.setHours(23,59,59,999); }

    const data = localAllData.filter(d => d.type !== 'pallet_label_request' && d.status === 'concluido').filter(d => { 
        if(d.jsDate < startDate) return false; 
        if(d.jsDate > endDate) return false; 
        return true; 
    });

    if (data.length === 0) { showToast("Nenhum dado RD no período.", "info"); return; }
    if (isDefaultFilter) showToast("Exportando últimos 30 dias (Padrão)", "info");

    const exportData = data.map(d => {
        let detalhesEmb = [];
        if(d.emb_amassada) detalhesEmb.push("Amassada");
        if(d.emb_rasgada) detalhesEmb.push("Rasgada");
        if(d.emb_vazamento) detalhesEmb.push("Vazamento");
        if(d.emb_outros) detalhesEmb.push(d.emb_outros);
        const tipoDetalhado = detalhesEmb.length > 0 ? detalhesEmb.join(", ") : "-";
        return {
            "DATA": d.jsDate.toLocaleDateString('pt-BR'), "MÊS": d.jsDate.toLocaleString('pt-BR', { month: 'long' }).toUpperCase(), "ANO": d.jsDate.getFullYear(),
            "ORIGEM / RESPONSÁVEL": d.infrator || '-', "IDENTIFICADOR": d.ass_colab || '-', "LOCAL": d.local || '-', "OCORRENCIA": d.tipo || '-', "TIPO OCORRENCIA": tipoDetalhado,
            "EMBARQUE": d.embarque || '-', "CLIENTE": d.nf || '-', "CÓDIGO": d.item_cod || '-', "DESCRIÇÃO DO ITEM": d.item_desc || '-', "LOTE": d.item_lote || '-', "QTD (CX)": d.item_qtd || '0', "ENDEREÇO": d.item_end || '-', "LIDER": d.ass_lider || '-', "INVENTÁRIO": d.ass_inv || '-', "OBSERVAÇÕES": d.obs || '-'
        };
    });
    generateXlsx(exportData, "Relatorio_RD");
}

function exportPalletReqToXlsx() {
    const iStart = document.getElementById('dash-filter-start'); const iEnd = document.getElementById('dash-filter-end');
    let startDate, endDate;
    if (iStart.value) { startDate = new Date(iStart.value + 'T00:00:00'); } else { startDate = new Date(); startDate.setDate(startDate.getDate() - 30); startDate.setHours(0,0,0,0); }
    if (iEnd.value) { endDate = new Date(iEnd.value + 'T23:59:59'); } else { endDate = new Date(); endDate.setHours(23,59,59,999); }

    const data = localAllData.filter(d => d.type === 'pallet_label_request' && d.status === 'concluido').filter(d => { 
        if(d.jsDate < startDate) return false; if(d.jsDate > endDate) return false; return true; 
    });

    if (data.length === 0) { showToast("Nenhuma etiqueta concluída no período.", "info"); return; }
    
    const exportData = data.map(d => {
        return { "Item / Código": d.item || '-', "Lote": d.lote || '-', "Quantidade": d.qtd || 0, "Data Solicitação": d.jsDate ? d.jsDate.toLocaleDateString('pt-BR') + ' ' + d.jsDate.toLocaleTimeString('pt-BR') : '-', "Status": "CONCLUÍDO" };
    });
    generateXlsx(exportData, "Etiquetas_Palete_Concluidas", [{wch: 50}, {wch: 20}, {wch: 15}, {wch: 20}, {wch: 15}]);
}

function generateXlsx(data, sheetName, cols) {
    if(window.XLSX) {
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        if(cols) ws['!cols'] = cols;
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        XLSX.writeFile(wb, `${sheetName}_${new Date().toISOString().slice(0,10)}.xlsx`);
    } else { showToast("Erro: Biblioteca XLSX não carregada.", "error"); }
}

export function printRncReport(id) {
    const item = localAllData.find(d => d.id === id);
    if (!item) return showToast("Erro ao carregar dados.", "error");

    const checkIcon = `<svg class="w-4 h-4 text-slate-800" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
    const emptyIcon = `<span class="w-4 h-4 inline-block border border-slate-300 rounded mr-1"></span>`;
    const check = (val) => val ? `<div class="flex items-center gap-1 font-bold text-slate-800">${checkIcon} SIM</div>` : `<div class="flex items-center gap-1 text-slate-400">${emptyIcon} NÃO</div>`;
    
    const statusColor = item.status === 'concluido' ? 'border-emerald-600' : 'border-amber-500';
    const statusText = item.status === 'concluido' ? 'CONCLUÍDO' : 'PENDENTE';
    const statusBg = item.status === 'concluido' ? 'bg-emerald-600' : 'bg-amber-500';

    const content = `
        <div class="flex justify-between items-start mb-6 border-b-2 ${statusColor} pb-4">
            <div>
                <h1 class="text-3xl font-black text-slate-800 uppercase tracking-tighter">Relatório de Divergência</h1>
                <p class="text-sm text-slate-500 font-mono mt-1">ID: ${item.id.toUpperCase()}</p>
            </div>
            <div class="text-right">
                <span class="${statusBg} text-white px-3 py-1 rounded text-xs font-bold uppercase tracking-wider">${statusText}</span>
                <p class="text-xs text-slate-400 mt-2">Data Emissão: ${new Date().toLocaleDateString('pt-BR')}</p>
            </div>
        </div>

        <div class="grid grid-cols-4 gap-4 mb-6">
            <div class="col-span-1 bg-slate-50 p-3 rounded border border-slate-200">
                <p class="text-[9px] font-bold text-slate-400 uppercase">Data Ocorrência</p>
                <p class="text-lg font-bold text-slate-800">${item.jsDate.toLocaleDateString('pt-BR')}</p>
            </div>
            <div class="col-span-1 bg-slate-50 p-3 rounded border border-slate-200">
                <p class="text-[9px] font-bold text-slate-400 uppercase">Tipo</p>
                <p class="text-lg font-bold text-slate-800">${item.tipo}</p>
            </div>
            <div class="col-span-1 bg-slate-50 p-3 rounded border border-slate-200">
                <p class="text-[9px] font-bold text-slate-400 uppercase">Local</p>
                <p class="text-lg font-bold text-slate-800">${item.local}</p>
            </div>
             <div class="col-span-1 bg-slate-50 p-3 rounded border border-slate-200">
                <p class="text-[9px] font-bold text-slate-400 uppercase">Origem/Infrator</p>
                <p class="text-sm font-bold text-slate-800 truncate">${item.infrator || 'N/A'}</p>
            </div>
        </div>

        <div class="mb-6 border border-slate-200 rounded-lg overflow-hidden">
            <div class="bg-slate-100 px-4 py-2 border-b border-slate-200 flex justify-between">
                <span class="text-xs font-bold text-slate-600 uppercase">Dados Logísticos & Produto</span>
            </div>
            <div class="p-4 grid grid-cols-2 gap-y-4 gap-x-8">
                <div>
                    <span class="block text-[10px] text-slate-400 uppercase">Embarque</span>
                    <span class="block font-mono font-bold text-slate-700 text-lg">${item.embarque || '-'}</span>
                </div>
                <div>
                    <span class="block text-[10px] text-slate-400 uppercase">Nota Fiscal / Cliente</span>
                    <span class="block font-mono font-bold text-slate-700 text-lg">${item.nf || '-'}</span>
                </div>
                <div class="col-span-2 border-t border-slate-100 pt-2"></div>
                <div class="col-span-2">
                    <span class="block text-[10px] text-slate-400 uppercase">Produto Afetado</span>
                    <span class="block font-bold text-slate-800 text-xl">${item.item_cod || '?'} - ${item.item_desc || '(Sem descrição)'}</span>
                </div>
                <div>
                    <span class="block text-[10px] text-slate-400 uppercase">Lote</span>
                    <span class="block font-mono text-slate-700">${item.item_lote || '-'}</span>
                </div>
                <div>
                    <span class="block text-[10px] text-slate-400 uppercase">Quantidade (Caixas)</span>
                    <span class="block font-mono font-bold text-red-600 text-xl">${item.item_qtd || '0'}</span>
                </div>
            </div>
        </div>

        <div class="mb-6">
            <h3 class="text-[10px] font-bold text-slate-400 uppercase mb-2 ml-1">Estado da Embalagem</h3>
            <div class="flex gap-4 border border-slate-200 rounded p-3 bg-white">
                <div class="flex-1">${check(item.emb_amassada)} <span class="text-xs ml-5">Amassada</span></div>
                <div class="flex-1">${check(item.emb_rasgada)} <span class="text-xs ml-5">Rasgada</span></div>
                <div class="flex-1">${check(item.emb_vazamento)} <span class="text-xs ml-5">Vazamento</span></div>
            </div>
            ${item.emb_outros ? `<div class="mt-2 text-xs text-slate-500 italic bg-slate-50 p-2 rounded border border-slate-100">Obs: ${item.emb_outros}</div>` : ''}
        </div>

        <div class="mb-8">
            <h3 class="text-[10px] font-bold text-slate-400 uppercase mb-2 ml-1">Relato Técnico / Observações</h3>
            <div class="w-full p-4 border border-slate-300 rounded bg-slate-50 min-h-[100px] text-sm text-slate-700 leading-relaxed">
                ${item.obs || 'Nenhuma observação registrada.'}
            </div>
        </div>

        <div class="mt-auto pt-4 border-t-2 border-slate-800">
            <div class="grid grid-cols-3 gap-8 text-center">
                <div>
                    <div class="h-10 flex items-end justify-center pb-1"><span class="font-bold text-slate-800 text-sm">${item.ass_colab || '-'}</span></div>
                    <div class="border-t border-slate-400 pt-1 text-[9px] uppercase font-bold text-slate-500">Reportado Por</div>
                </div>
                <div>
                    <div class="h-10 flex items-end justify-center pb-1"><span class="font-bold text-slate-800 text-sm">${item.ass_lider || ''}</span></div>
                    <div class="border-t border-slate-400 pt-1 text-[9px] uppercase font-bold text-slate-500">Liderança</div>
                </div>
                <div>
                    <div class="h-10 flex items-end justify-center pb-1"><span class="font-bold text-slate-800 text-sm">${item.ass_inv || ''}</span></div>
                    <div class="border-t border-slate-400 pt-1 text-[9px] uppercase font-bold text-slate-500">Inventário</div>
                </div>
            </div>
        </div>
    `;
    let titleParts = ['RD'];
    if (item.embarque) titleParts.push(item.embarque);
    if (item.nf) titleParts.push(item.nf);
    if (titleParts.length === 1) { titleParts.push('INTERNO'); titleParts.push(item.id.substring(0,5).toUpperCase()); }
    printDocument(titleParts.join('-'), content);
}