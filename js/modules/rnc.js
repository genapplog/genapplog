// ARQUIVO: js/modules/rnc.js
import { onSnapshot, collection, addDoc, updateDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { safeBind, showToast, openConfirmModal, closeConfirmModal } from '../utils.js';
import { PATHS } from '../config.js';

// --- ESTADO DO MÓDULO ---
let currentCollectionRef = null; // Referência dinâmica do banco (Prod ou Teste)
let bindingsInitialized = false; // Trava para não duplicar cliques

// Dados
let allOccurrencesData = [];
let filteredOccurrencesData = [];
let pendingOccurrencesData = [];
let currentOccurrenceId = null;
let currentFormStatus = 'draft';
let unsubscribeOccurrences = null;

// Gráficos
let chartTypeInstance = null;
let chartLocalInstance = null;
let chartCausadorInstance = null;
let chartIdentificadorInstance = null;

export async function initRncModule(db, isTest) {
    const PROD_OC_PATH = PATHS.prod.occurrences;
    const path = isTest ? PATHS.test.occurrences : PROD_OC_PATH;
    
    // Atualiza a referência global para que os botões saibam onde salvar
    currentCollectionRef = collection(db, path);

    // Limpa listener anterior para não duplicar a leitura
    if (unsubscribeOccurrences) unsubscribeOccurrences();

    // Inicia o monitoramento em tempo real (APENAS do ambiente atual)
    unsubscribeOccurrences = onSnapshot(currentCollectionRef, (snapshot) => {
        allOccurrencesData = []; 
        pendingOccurrencesData = []; 
        const finalDataMap = new Map(); // Começa limpo (sem dados de prod)

        snapshot.forEach(docSnap => {
            const d = docSnap.data(); 
            d.id = docSnap.id; 
            d.jsDate = d.createdAt && d.createdAt.toDate ? d.createdAt.toDate() : new Date(d.createdAt); 
            d.isProdCopy = false;
            finalDataMap.set(d.id, d);
        });

        // Converte Map para Array e separa por status
        const combinedData = Array.from(finalDataMap.values());
        combinedData.forEach(d => { 
            if (d.status === 'concluido') allOccurrencesData.push(d); 
            else pendingOccurrencesData.push(d); 
        });

        // Ordenação
        allOccurrencesData.sort((a, b) => b.jsDate - a.jsDate); 
        pendingOccurrencesData.sort((a, b) => b.jsDate - a.jsDate);

        updateDashboard(); 
        updatePendingList(); 
        renderAdminOccurrenceList();
    });

    // Configura os botões APENAS UMA VEZ
    if (!bindingsInitialized) {
        setupRncBindings();
        bindingsInitialized = true;
    }
}

function setupRncBindings() {
    // Navegação
    safeBind('btn-open-oc-dashboard', 'click', () => { document.getElementById('ocorrencias-menu-view').classList.add('hidden'); document.getElementById('ocorrencias-dashboard').classList.remove('hidden'); updateDashboard(); });
    safeBind('btn-open-oc-novo', 'click', () => { document.getElementById('ocorrencias-menu-view').classList.add('hidden'); document.getElementById('ocorrencias-novo').classList.remove('hidden'); resetForm(); });
    safeBind('btn-back-oc-dash', 'click', () => { document.getElementById('ocorrencias-dashboard').classList.add('hidden'); document.getElementById('ocorrencias-menu-view').classList.remove('hidden'); });
    safeBind('btn-back-oc-form', 'click', () => { document.getElementById('ocorrencias-novo').classList.add('hidden'); document.getElementById('ocorrencias-menu-view').classList.remove('hidden'); });
    safeBind('btn-cancel-occurrence', 'click', () => { document.getElementById('ocorrencias-novo').classList.add('hidden'); document.getElementById('ocorrencias-menu-view').classList.remove('hidden'); });

    // Dashboard
    safeBind('btn-dash-filter-apply', 'click', applyDashboardFilters);
    safeBind('btn-dash-filter-clear', 'click', () => { document.getElementById('dash-filter-start').value = ''; document.getElementById('dash-filter-end').value = ''; applyDashboardFilters(); });
    safeBind('btn-dash-export', 'click', exportToXlsx);

    // Ações do Formulário (Usam currentCollectionRef)
    safeBind('btn-save-occurrence', 'click', () => handleSave());
    safeBind('btn-reject-occurrence', 'click', () => handleReject());
    safeBind('btn-delete-permanent', 'click', () => handleDelete());

    // Admin Table
    safeBind('btn-refresh-admin-list', 'click', () => renderAdminOccurrenceList());
    safeBind('admin-search-input', 'input', () => renderAdminOccurrenceList());
    safeBind('admin-search-clear', 'click', () => { 
        const input = document.getElementById('admin-search-input'); 
        if(input) { input.value = ''; renderAdminOccurrenceList(); } 
    });
}

function updatePendingList() {
    const tbody = document.getElementById('pending-list-tbody'); 
    if (!tbody) return;
    
    tbody.innerHTML = ''; // Limpa antes de desenhar
    
    if (pendingOccurrencesData.length === 0) { 
        tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-slate-500 italic">Nenhum relatório pendente.</td></tr>'; 
        return; 
    }
    
    // Filtro extra de segurança para IDs duplicados na visualização
    const uniqueList = Array.from(new Map(pendingOccurrencesData.map(item => [item.id, item])).values());

    uniqueList.forEach(item => {
        const tr = document.createElement('tr'); 
        const rowClass = "border-b border-slate-700 hover:bg-slate-750 transition-colors";
        tr.className = rowClass;
        
        let statusBadge = item.status === 'pendente_lider' ? '<span class="badge-pending">Aguard. Líder</span>' : item.status === 'pendente_inventario' ? '<span class="badge-blue">Aguard. Inventário</span>' : '<span class="text-xs text-slate-500">Rascunho</span>';
        let actionText = item.status === 'pendente_lider' ? 'Assinar (Líder)' : item.status === 'pendente_inventario' ? 'Revisar e Finalizar' : 'Continuar';
        
        const displayNF = item.nf ? item.nf : '-';

        tr.innerHTML = `<td class="px-4 py-3 text-slate-300 font-mono text-xs">${item.jsDate.toLocaleDateString('pt-BR')}</td><td class="px-4 py-3 text-white font-medium">${item.embarque || '-'} / ${displayNF}</td><td class="px-4 py-3 text-slate-300 text-xs">${item.tipo}</td><td class="px-4 py-3">${statusBadge}</td><td class="px-4 py-3 text-right"><button class="text-indigo-400 hover:text-white text-xs font-bold uppercase tracking-wide bg-indigo-900/30 px-3 py-1.5 rounded border border-indigo-500/30 hover:bg-indigo-600 hover:border-indigo-500 transition-all btn-open-occurrence" data-id="${item.id}">${actionText}</button></td>`;
        tbody.appendChild(tr);
    });

    // Re-bind dos botões de abrir (remove antigos para não acumular memória)
    const newBody = tbody.cloneNode(true);
    tbody.parentNode.replaceChild(newBody, tbody);
    newBody.querySelectorAll('.btn-open-occurrence').forEach(btn => btn.addEventListener('click', (e) => openOccurrenceForEdit(e.target.dataset.id)));
}

// ... Funções de Dashboard (sem alterações) ...
function updateDashboard() { applyDashboardFilters(); }
function applyDashboardFilters() {
    const startVal = document.getElementById('dash-filter-start').value; const endVal = document.getElementById('dash-filter-end').value;
    let startDate = startVal ? new Date(startVal + 'T00:00:00') : null; let endDate = endVal ? new Date(endVal + 'T23:59:59') : null;
    filteredOccurrencesData = allOccurrencesData.filter(d => { if(startDate && d.jsDate < startDate) return false; if(endDate && d.jsDate > endDate) return false; return true; });
    updateChartsAndStats(filteredOccurrencesData);
}

function updateChartsAndStats(data) {
    let total = data.length; let types = { FALTA: 0, SOBRA: 0, AVARIA: 0, FALTA_INTERNA: 0 }; let locals = { ARMAZENAGEM: 0, ESTOQUE: 0, CHECKOUT: 0, SEPARAÇÃO: 0 }; let causadores = {}, identificadores = {};
    data.forEach(d => { if(types[d.tipo] !== undefined) types[d.tipo]++; if(locals[d.local] !== undefined) locals[d.local]++; const nmCausador = (d.infrator || 'Não Informado').trim().toUpperCase(); if(nmCausador) causadores[nmCausador] = (causadores[nmCausador] || 0) + 1; const nmIdentificador = (d.ass_colab || 'Não Informado').trim().toUpperCase(); if(nmIdentificador) identificadores[nmIdentificador] = (identificadores[nmIdentificador] || 0) + 1; });
    document.getElementById('dash-total-oc').innerText = total; document.getElementById('dash-last-date').innerText = (total > 0 && data[0].jsDate) ? data[0].jsDate.toLocaleDateString('pt-BR') : "-";
    let maxType = "-", maxVal = -1; for(const [k, v] of Object.entries(types)) if(v > maxVal && v > 0) { maxVal = v; maxType = k; }
    document.getElementById('dash-top-type').innerText = maxType;
    const updateChart = (id, type, labels, data, bg, instance) => { const ctx = document.getElementById(id); if(instance) instance.destroy(); return new Chart(ctx, { type, data: { labels, datasets: [{ label: 'Qtd', data, backgroundColor: bg, borderWidth: 0, borderRadius: 4 }] }, options: { indexAxis: type === 'bar' && id.includes('Causador') ? 'y' : 'x', responsive: true, plugins: { legend: { display: type === 'doughnut', position: 'bottom', labels: { color: '#cbd5e1' } } }, scales: type === 'bar' ? { y: { beginAtZero: true, grid: { color: '#334155' }, ticks: { color: '#cbd5e1' } }, x: { grid: { display: false }, ticks: { color: '#cbd5e1' } } } : {} } }); };
    chartTypeInstance = updateChart('chartOcType', 'doughnut', ['Falta', 'Sobra', 'Avaria', 'Falta Interna'], [types.FALTA, types.SOBRA, types.AVARIA, types.FALTA_INTERNA], ['#ef4444', '#3b82f6', '#f59e0b', '#a855f7'], chartTypeInstance);
    chartLocalInstance = updateChart('chartOcLocal', 'bar', ['Armazenagem', 'Estoque', 'Checkout', 'Separação'], [locals.ARMAZENAGEM, locals.ESTOQUE, locals.CHECKOUT, locals.SEPARAÇÃO], '#6366f1', chartLocalInstance);
    const sortObj = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const sCaus = sortObj(causadores); chartCausadorInstance = new Chart(document.getElementById('chartOcCausador'), { type: 'bar', data: { labels: sCaus.map(i=>i[0]), datasets: [{ data: sCaus.map(i=>i[1]), backgroundColor: '#f43f5e', borderRadius: 4, barThickness: 20 }] }, options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, grid: { color: '#334155' }, ticks: { color: '#cbd5e1', stepSize: 1 } }, y: { grid: { display: false }, ticks: { color: '#cbd5e1', font: { size: 10 } } } } } });
    const sIdent = sortObj(identificadores); chartIdentificadorInstance = new Chart(document.getElementById('chartOcIdentificador'), { type: 'bar', data: { labels: sIdent.map(i=>i[0]), datasets: [{ data: sIdent.map(i=>i[1]), backgroundColor: '#10b981', borderRadius: 4, barThickness: 20 }] }, options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, grid: { color: '#334155' }, ticks: { color: '#cbd5e1', stepSize: 1 } }, y: { grid: { display: false }, ticks: { color: '#cbd5e1', font: { size: 10 } } } } } });
}

function openOccurrenceForEdit(id) {
    const item = pendingOccurrencesData.find(d => d.id === id); if (!item) return;
    currentOccurrenceId = id; currentFormStatus = item.status;
    document.getElementById('form-embarque').value = item.embarque || ''; document.getElementById('form-nf').value = item.nf || ''; if(item.dataRef) document.getElementById('form-data').value = item.dataRef;
    if(item.tipo) { const input = document.querySelector(`input[name="oc_tipo"][value="${item.tipo}"]`); if(input) input.checked = true; }
    if(item.local) { const input = document.querySelector(`input[name="oc_local"][value="${item.local}"]`); if(input) input.checked = true; }
    document.getElementById('form-obs').value = item.obs || ''; document.getElementById('check-amassada').checked = item.emb_amassada || false; document.getElementById('check-rasgada').checked = item.emb_rasgada || false; document.getElementById('check-vazamento').checked = item.emb_vazamento || false; document.getElementById('form-outros-emb').value = item.emb_outros || '';
    document.getElementById('form-item-cod').value = item.item_cod || ''; document.getElementById('form-item-desc').value = item.item_desc || ''; document.getElementById('form-item-lote').value = item.item_lote || ''; document.getElementById('form-item-qtd').value = item.item_qtd || ''; document.getElementById('form-item-end').value = item.item_end || ''; document.getElementById('form-infrator').value = item.infrator || '';
    document.getElementById('form-ass-colab').value = item.ass_colab || ''; document.getElementById('form-ass-lider').value = item.ass_lider || ''; document.getElementById('form-ass-inv').value = item.ass_inv || '';
    updateFormStateUI();
    document.getElementById('ocorrencias-menu-view').classList.add('hidden'); document.getElementById('ocorrencias-novo').classList.remove('hidden');
}

function resetForm() {
    currentOccurrenceId = null; currentFormStatus = 'draft';
    document.querySelectorAll('#ocorrencias-novo input, #ocorrencias-novo textarea').forEach(i => { if(i.type === 'radio' || i.type === 'checkbox') i.checked = false; else i.value = ''; i.disabled = false; });
    document.getElementById('form-data').valueAsDate = new Date();
    updateFormStateUI();
}

function updateFormStateUI() {
    const status = currentFormStatus;
    const statusBar = document.getElementById('form-status-bar');
    const dataInputs = document.querySelectorAll('.data-input');
    const inputColab = document.getElementById('form-ass-colab'), inputLider = document.getElementById('form-ass-lider'), inputInv = document.getElementById('form-ass-inv'), inputInfrator = document.getElementById('form-infrator');
    const btnSave = document.getElementById('btn-save-occurrence');
    const btnReject = document.getElementById('btn-reject-occurrence');
    const btnDelete = document.getElementById('btn-delete-permanent');
    inputColab.disabled = true; inputColab.className = 'w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-500 text-sm';
    inputLider.disabled = true; inputLider.className = 'w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-500 text-sm';
    inputInv.disabled = true; inputInv.className = 'w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-slate-500 text-sm';
    dataInputs.forEach(input => input.disabled = false);
    btnReject.classList.add('hidden'); btnDelete.classList.add('hidden');
    if (status === 'draft') {
        statusBar.innerText = "Etapa 1: Preenchimento Inicial"; statusBar.className = "bg-indigo-900/40 text-indigo-200 px-4 py-3 text-xs font-bold uppercase tracking-wider text-center border-b border-indigo-500/20";
        inputInfrator.disabled = true; inputInfrator.placeholder = "Reservado ao Inventário"; inputInfrator.classList.add('opacity-50');
        inputColab.disabled = false; inputColab.className = 'w-full bg-slate-900 border border-indigo-900/50 rounded px-3 py-2 text-white text-sm focus:border-indigo-500';
        btnSave.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Assinar e Enviar`;
        if(currentOccurrenceId) btnDelete.classList.remove('hidden'); btnDelete.innerText = "Excluir Rascunho";
    } else if (status === 'pendente_lider') {
        statusBar.innerText = "Etapa 2: Aprovação do Líder"; statusBar.className = "bg-amber-900/40 text-amber-200 px-4 py-3 text-xs font-bold uppercase tracking-wider text-center border-b border-amber-500/20";
        dataInputs.forEach(input => input.disabled = true);
        inputLider.disabled = false; inputLider.placeholder = "Digite seu nome para aprovar"; inputLider.className = 'w-full bg-slate-900 border border-amber-900/50 rounded px-3 py-2 text-white text-sm focus:border-amber-500';
        btnSave.innerText = "Aprovar e Enviar"; btnReject.classList.remove('hidden'); btnDelete.classList.remove('hidden'); btnDelete.innerText = "Excluir RNC";
    } else if (status === 'pendente_inventario') {
        statusBar.innerText = "Etapa 3: Validação do Inventário"; statusBar.className = "bg-blue-900/40 text-blue-200 px-4 py-3 text-xs font-bold uppercase tracking-wider text-center border-b border-blue-500/20";
        dataInputs.forEach(input => input.disabled = false);
        inputInfrator.disabled = false; inputInfrator.placeholder = "Nome do responsável..."; inputInfrator.classList.remove('opacity-50');
        inputInv.disabled = false; inputInv.placeholder = "Digite seu nome para finalizar"; inputInv.className = 'w-full bg-slate-900 border border-blue-900/50 rounded px-3 py-2 text-white text-sm focus:border-blue-500';
        btnSave.innerText = "Validar e Finalizar"; btnReject.classList.remove('hidden'); btnDelete.classList.remove('hidden'); btnDelete.innerText = "Excluir RNC";
    }
}

async function handleSave() {
    const btn = document.getElementById('btn-save-occurrence'); 
    btn.disabled = true; 
    btn.innerText = "Processando...";
    
    try {
        const data = {
            updatedAt: new Date(), embarque: document.getElementById('form-embarque').value, nf: document.getElementById('form-nf').value, dataRef: document.getElementById('form-data').value, tipo: document.querySelector('input[name="oc_tipo"]:checked')?.value || "N/A", local: document.querySelector('input[name="oc_local"]:checked')?.value || "N/A", obs: document.getElementById('form-obs').value,
            emb_amassada: document.getElementById('check-amassada').checked, emb_rasgada: document.getElementById('check-rasgada').checked, emb_vazamento: document.getElementById('check-vazamento').checked, emb_outros: document.getElementById('form-outros-emb').value,
            item_cod: document.getElementById('form-item-cod').value, item_desc: document.getElementById('form-item-desc').value, item_lote: document.getElementById('form-item-lote').value, item_qtd: document.getElementById('form-item-qtd').value, item_end: document.getElementById('form-item-end').value, infrator: document.getElementById('form-infrator').value,
            ass_colab: document.getElementById('form-ass-colab').value, ass_lider: document.getElementById('form-ass-lider').value, ass_inv: document.getElementById('form-ass-inv').value
        };
        
        let newStatus = currentFormStatus;
        if (currentFormStatus === 'draft') { if (!data.ass_colab.trim()) throw new Error("Assinatura obrigatória."); if(!data.tipo || data.tipo === "N/A") throw new Error("Selecione o Tipo."); newStatus = 'pendente_lider'; data.createdAt = new Date(); }
        else if (currentFormStatus === 'pendente_lider') { if (!data.ass_lider.trim()) throw new Error("Assinatura obrigatória."); newStatus = 'pendente_inventario'; }
        else if (currentFormStatus === 'pendente_inventario') { if (!data.ass_inv.trim()) throw new Error("Assinatura obrigatória."); newStatus = 'concluido'; }
        data.status = newStatus;

        // Usa a referência global currentCollectionRef
        if (currentOccurrenceId) await updateDoc(doc(currentCollectionRef, currentOccurrenceId), data); 
        else await addDoc(currentCollectionRef, data);
        
        showToast("Relatório salvo!"); 
        document.getElementById('ocorrencias-novo').classList.add('hidden'); 
        document.getElementById('ocorrencias-menu-view').classList.remove('hidden');
    } catch(e) { 
        console.error(e); 
        showToast(e.message || "Erro.", "error"); 
    } finally { 
        btn.disabled = false; 
        btn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Salvar e Avançar`; 
    }
}

async function handleReject() {
    openConfirmModal("Solicitar Correção?", "O relatório voltará para rascunho e as assinaturas serão limpas.", async () => {
        try { if (!currentOccurrenceId) return; await updateDoc(doc(currentCollectionRef, currentOccurrenceId), { status: 'draft', ass_lider: '', ass_inv: '', updatedAt: new Date() }); showToast("Devolvido para correção."); closeConfirmModal(); document.getElementById('ocorrencias-novo').classList.add('hidden'); document.getElementById('ocorrencias-menu-view').classList.remove('hidden'); } catch { showToast("Erro ao rejeitar.", "error"); }
    });
}

async function handleDelete() {
    openConfirmModal("Excluir Definitivamente?", "Esta ação não pode ser desfeita.", async () => {
        try { if (!currentOccurrenceId) return; await deleteDoc(doc(currentCollectionRef, currentOccurrenceId)); showToast("Excluído."); closeConfirmModal(); document.getElementById('ocorrencias-novo').classList.add('hidden'); document.getElementById('ocorrencias-menu-view').classList.remove('hidden'); } catch { showToast("Erro ao excluir.", "error"); }
    });
}

function exportToXlsx() {
    if (filteredOccurrencesData.length === 0) { 
        showToast("Nenhum dado para exportar.", "error"); 
        return; 
    }

    const exportData = filteredOccurrencesData.map(d => {
        // Garante que a data é um objeto Date válido
        const dateObj = d.jsDate || new Date();
        
        // Lógica para concatenar os detalhes da embalagem (Tipo Ocorrência)
        let detalhesEmb = [];
        if(d.emb_amassada) detalhesEmb.push("Amassada");
        if(d.emb_rasgada) detalhesEmb.push("Rasgada");
        if(d.emb_vazamento) detalhesEmb.push("Vazamento");
        if(d.emb_outros) detalhesEmb.push(d.emb_outros);
        const tipoDetalhado = detalhesEmb.length > 0 ? detalhesEmb.join(", ") : "-";

        // Mapeamento exato das colunas solicitadas
        return {
            "DATA": dateObj.toLocaleDateString('pt-BR'),
            "MÊS": dateObj.toLocaleString('pt-BR', { month: 'long' }).toUpperCase(),
            "ANO": dateObj.getFullYear(),
            "ORIGEM / RESPONSÁVEL": d.infrator || '-',
            "IDENTIFICADOR": d.ass_colab || '-',
            "LOCAL": d.local || '-',
            "OCORRENCIA": d.tipo || '-', // Ex: FALTA, SOBRA
            "TIPO OCORRENCIA": tipoDetalhado, // Ex: Amassada, Rasgada
            "EMBARQUE": d.embarque || '-',
            "CLIENTE": d.nf || '-', // Campo NF agora usado como Cliente
            "CÓDIGO": d.item_cod || '-',
            "DESCRIÇÃO DO ITEM": d.item_desc || '-',
            "LOTE": d.item_lote || '-',
            "QTD (CX)": d.item_qtd || '0',
            "ENDEREÇO": d.item_end || '-',
            "LIDER": d.ass_lider || '-',
            "INVENTÁRIO": d.ass_inv || '-',
            "OBSERVAÇÕES": d.obs || '-'
        };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    
    // Ajusta a largura das colunas (Opcional, mas fica mais bonito)
    const wscols = [
        {wch: 12}, // Data
        {wch: 10}, // Mês
        {wch: 6},  // Ano
        {wch: 25}, // Origem
        {wch: 20}, // Identificador
        {wch: 15}, // Local
        {wch: 15}, // Ocorrência
        {wch: 20}, // Tipo Ocorrência
        {wch: 15}, // Embarque
        {wch: 30}, // Cliente
        {wch: 15}, // Código
        {wch: 40}, // Descrição
        {wch: 15}, // Lote
        {wch: 10}, // Qtd
        {wch: 15}, // Endereço
        {wch: 20}, // Líder
        {wch: 20}, // Inventário
        {wch: 50}  // Obs
    ];
    ws['!cols'] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, "Relatorio_RNC");
    
    // Gera nome do arquivo com data e hora para não sobrescrever
    const fileName = `Relatorio_RNC_${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.xlsx`;
    XLSX.writeFile(wb, fileName);
}

function renderAdminOccurrenceList() {
    const tbody = document.getElementById('admin-oc-list-tbody'); 
    const searchInput = document.getElementById('admin-search-input'); 
    const clearBtn = document.getElementById('admin-search-clear');
    
    if (!tbody || !searchInput) return;

    const searchTerm = searchInput.value.toLowerCase().trim();
    if(clearBtn) clearBtn.classList.toggle('hidden', searchTerm === '');
    
    tbody.innerHTML = '';

    const fullList = [...pendingOccurrencesData, ...allOccurrencesData];
    const uniqueList = Array.from(new Map(fullList.map(item => [item.id, item])).values()); // Garante unicidade na admin table também

    const filteredList = uniqueList.filter(item => {
        if (!searchTerm) return true;
        const clienteNF = (item.nf || '').toLowerCase(); 
        const emb = (item.embarque || '').toLowerCase();
        const tipo = (item.tipo || '').toLowerCase();
        return clienteNF.includes(searchTerm) || emb.includes(searchTerm) || tipo.includes(searchTerm);
    });

    filteredList.sort((a, b) => b.jsDate - a.jsDate);

    if (filteredList.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-slate-500 italic">Nenhum registro encontrado.</td></tr>'; return; }

    filteredList.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-800 transition-colors border-b border-slate-800/50";
        let statusColor = item.status === 'concluido' ? "text-emerald-400 font-bold" : "text-amber-400";
        const displayNF = item.nf ? item.nf : '-';
        tr.innerHTML = `<td class="px-4 py-3 font-mono text-slate-300">${item.jsDate.toLocaleDateString('pt-BR')}</td><td class="px-4 py-3 font-bold text-white text-xs">${item.tipo}</td><td class="px-4 py-3 text-slate-300 text-xs">${item.embarque || '-'} <br> <span class="text-white font-medium">${displayNF}</span></td><td class="px-4 py-3 ${statusColor} uppercase text-[10px] tracking-wide">${item.status}</td><td class="px-4 py-3 text-right"><button class="text-red-400 hover:text-red-200 bg-red-900/20 hover:bg-red-900/50 px-2 py-1.5 rounded transition btn-delete-individual flex items-center justify-center ml-auto gap-1 text-[10px] border border-red-900/30" data-id="${item.id}" title="Excluir permanentemente"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>Excluir</button></td>`;
        tbody.appendChild(tr);
    });

    // Re-bind com clone para evitar múltiplos listeners nos botões de excluir
    const newBody = tbody.cloneNode(true);
    tbody.parentNode.replaceChild(newBody, tbody);
    newBody.querySelectorAll('.btn-delete-individual').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.id;
            openConfirmModal("Excluir Definitivamente?", "Registro sumirá dos gráficos.", async () => { try { await deleteDoc(doc(currentCollectionRef, id)); showToast("Excluído."); closeConfirmModal(); } catch { showToast("Erro ao excluir.", "error"); } });
        });
    });
}