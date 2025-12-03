/**
 * ARQUIVO: js/modules/rnc.js
 * DESCRIÇÃO: Gestão de Divergências, Dashboard, Leitura Inteligente e Notificações (10 min).
 */
import { onSnapshot, collection, addDoc, updateDoc, deleteDoc, doc, getDocs, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { safeBind, showToast, openConfirmModal, closeConfirmModal, printDocument, sendDesktopNotification } from '../utils.js';
import { PATHS } from '../config.js';
import { getUserRole, getCurrentUserName } from './auth.js';

// --- ESTADO DO MÓDULO ---
let currentCollectionRef = null;
let globalDb = null;
let bindingsInitialized = false;

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
    globalDb = db; 
    const PROD_OC_PATH = PATHS.prod.occurrences;
    const path = isTest ? PATHS.test.occurrences : PROD_OC_PATH;
    
    currentCollectionRef = collection(db, path);

    if (unsubscribeOccurrences) unsubscribeOccurrences();

    // Monitoramento em Tempo Real
    unsubscribeOccurrences = onSnapshot(currentCollectionRef, (snapshot) => {
        allOccurrencesData = []; 
        pendingOccurrencesData = []; 
        
        // Notificação Imediata (apenas se já inicializou para não apitar tudo ao abrir)
        if (bindingsInitialized) {
            snapshot.docChanges().forEach(change => {
                if (change.type === "added" || change.type === "modified") {
                    checkAndNotify(change.doc.data());
                }
            });
        }
        
        snapshot.forEach(docSnap => {
            const d = docSnap.data(); 
            d.id = docSnap.id; 
            d.jsDate = d.createdAt && d.createdAt.toDate ? d.createdAt.toDate() : new Date(d.createdAt); 
            
            if (d.status === 'concluido') allOccurrencesData.push(d); 
            else pendingOccurrencesData.push(d); 
        });

        allOccurrencesData.sort((a, b) => b.jsDate - a.jsDate); 
        pendingOccurrencesData.sort((a, b) => b.jsDate - a.jsDate);

        updateDashboard(); 
        updatePendingList(); 
        renderAdminOccurrenceList();
    });

    // Configuração Única (Botões e Timer)
    if (!bindingsInitialized) {
        setupRncBindings();
        
        // 👇 TIMER DE 5 MINUTOS (300.000 ms)
        setInterval(checkReminders, 300000);
        
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

    // Scanner Inteligente
    safeBind('smart-scanner-input', 'change', async (e) => {
        const barcode = e.target.value.trim();
        if (barcode) { await handleSmartScan(barcode); e.target.value = ''; }
    });

    // Dashboard e Filtros
    safeBind('btn-dash-filter-apply', 'click', applyDashboardFilters);
    safeBind('btn-dash-filter-clear', 'click', () => { document.getElementById('dash-filter-start').value = ''; document.getElementById('dash-filter-end').value = ''; applyDashboardFilters(); });
    safeBind('btn-dash-export', 'click', exportToXlsx);
    
    safeBind('history-search-input', 'input', renderHistoryTable);
    safeBind('history-search-clear', 'click', () => { const i = document.getElementById('history-search-input'); if(i){ i.value=''; renderHistoryTable(); } });

    // Ações Formulário
    safeBind('btn-save-occurrence', 'click', () => handleSave());
    safeBind('btn-reject-occurrence', 'click', () => handleReject());
    safeBind('btn-delete-permanent', 'click', () => handleDelete());

    // Admin Table
    safeBind('btn-refresh-admin-list', 'click', () => renderAdminOccurrenceList());
    safeBind('admin-search-input', 'input', () => renderAdminOccurrenceList());
    safeBind('admin-search-clear', 'click', () => { const i = document.getElementById('admin-search-input'); if(i){ i.value=''; renderAdminOccurrenceList(); } });
}

// --- NOTIFICAÇÕES ---

// 1. Notificação Imediata
function checkAndNotify(data) {
    const myRole = getUserRole();
    const myName = getCurrentUserName();

    if (data.status === 'pendente_lider' && (myRole === 'LIDER' || myRole === 'ADMIN')) {
        if (data.ass_colab !== myName) sendDesktopNotification("Nova Pendência", `RNC de ${data.tipo} aguardando aprovação.`);
    }
    if (data.status === 'pendente_inventario' && (myRole === 'INVENTARIO' || myRole === 'ADMIN')) {
        if (data.ass_lider !== myName) sendDesktopNotification("Atenção Inventário", `Líder aprovou RNC de ${data.tipo}. Validação necessária.`);
    }
}

// 2. Notificação Recorrente (A cada 10 min)
function checkReminders() {
    const myRole = getUserRole();
    const myName = getCurrentUserName();
    let count = 0;

    pendingOccurrencesData.forEach(item => {
        // Se sou LIDER e tem algo parado no Líder (que não fui eu que abri)
        if (item.status === 'pendente_lider' && (myRole === 'LIDER' || myRole === 'ADMIN')) {
             if (item.ass_colab !== myName) count++;
        }
        // Se sou INVENTARIO e tem algo parado no Inventário
        if (item.status === 'pendente_inventario' && (myRole === 'INVENTARIO' || myRole === 'ADMIN')) {
             if (item.ass_lider !== myName) count++;
        }
    });

    if (count > 0) {
        sendDesktopNotification("Lembrete", `Existem ${count} RNC(s) aguardando sua ação.`);
    }
}

// --- LÓGICA DE LEITURA INTELIGENTE (GS1 RAW) ---
async function handleSmartScan(barcode) {
    let dun = ""; let lote = "";
    let raw = barcode.replace(/[()]/g, ''); 
    
    if (raw.startsWith('01')) { dun = raw.substring(2, 16); raw = raw.substring(16); } 
    else if (raw.length >= 14 && !isNaN(raw.substring(0,14))) { dun = barcode.substring(0, 14); }

    let encontrouData = true;
    while (encontrouData && raw.length > 0) { 
        if (raw.startsWith('11') || raw.startsWith('13') || raw.startsWith('17')) { raw = raw.substring(8); } 
        else { encontrouData = false; } 
    }

    if (raw.startsWith('10')) { lote = raw.substring(2); } 
    else { const matchLoteFim = barcode.replace(/[()]/g, '').match(/10([a-zA-Z0-9]+)$/); if (matchLoteFim) lote = matchLoteFim[1]; }

    if (lote) { const elLote = document.getElementById('form-item-lote'); elLote.value = lote; highlightField(elLote); }
    if (dun && globalDb) {
        showToast(`Buscando DUN: ${dun}...`, "info");
        try {
            const docRef = doc(globalDb, "products", dun);
            const docSnap = await getDoc(docRef);
            const elCod = document.getElementById('form-item-cod'); const elDesc = document.getElementById('form-item-desc');
            if (docSnap.exists()) { const prod = docSnap.data(); elCod.value = prod.codigo || dun; elDesc.value = prod.descricao || ""; highlightField(elCod); highlightField(elDesc); showToast("Produto encontrado!"); } 
            else { elCod.value = dun; elDesc.value = ""; elDesc.placeholder = "Produto não cadastrado"; showToast("Produto não cadastrado.", "error"); highlightField(elCod); }
        } catch (e) { console.error("Erro ao buscar produto:", e); }
    }
    document.getElementById('form-item-qtd').focus();
}
function highlightField(el) { el.classList.add('bg-indigo-900/50', 'text-indigo-200'); setTimeout(() => el.classList.remove('bg-indigo-900/50', 'text-indigo-200'), 1000); }

// --- Listas ---
function updatePendingList() {
    const tbody = document.getElementById('pending-list-tbody'); if (!tbody) return;
    tbody.innerHTML = '';
    if (pendingOccurrencesData.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-slate-500 italic">Nenhum relatório pendente.</td></tr>'; return; }
    const uniqueList = Array.from(new Map(pendingOccurrencesData.map(item => [item.id, item])).values());
    uniqueList.forEach(item => {
        const tr = document.createElement('tr'); tr.className = "border-b border-slate-700 hover:bg-slate-750 transition-colors";
        let statusBadge = item.status === 'pendente_lider' ? '<span class="badge-pending">Aguard. Líder</span>' : item.status === 'pendente_inventario' ? '<span class="badge-blue">Aguard. Inventário</span>' : '<span class="text-xs text-slate-500">Rascunho</span>';
        let actionText = item.status === 'pendente_lider' ? 'Assinar (Líder)' : item.status === 'pendente_inventario' ? 'Revisar e Finalizar' : 'Continuar';
        const displayNF = item.nf ? item.nf : '-';
        tr.innerHTML = `<td class="px-4 py-3 text-slate-300 font-mono text-xs">${item.jsDate.toLocaleDateString('pt-BR')}</td><td class="px-4 py-3 text-white font-medium">${item.embarque || '-'} / ${displayNF}</td><td class="px-4 py-3 text-slate-300 text-xs">${item.tipo}</td><td class="px-4 py-3">${statusBadge}</td><td class="px-4 py-3 text-right"><button class="text-indigo-400 hover:text-white text-xs font-bold uppercase tracking-wide bg-indigo-900/30 px-3 py-1.5 rounded border border-indigo-500/30 hover:bg-indigo-600 hover:border-indigo-500 transition-all btn-open-occurrence" data-id="${item.id}">${actionText}</button></td>`;
        tbody.appendChild(tr);
    });
    const newBody = tbody.cloneNode(true); tbody.parentNode.replaceChild(newBody, tbody);
    newBody.querySelectorAll('.btn-open-occurrence').forEach(btn => btn.addEventListener('click', (e) => openOccurrenceForEdit(e.target.dataset.id)));
}

// --- CONTROLE DE PERMISSÕES ---
function updateFormStateUI() {
    const status = currentFormStatus;
    const dataInputs = document.querySelectorAll('.data-input');
    const inputColab = document.getElementById('form-ass-colab'), inputLider = document.getElementById('form-ass-lider'), inputInv = document.getElementById('form-ass-inv'), inputInfrator = document.getElementById('form-infrator');
    const btnSave = document.getElementById('btn-save-occurrence'), btnReject = document.getElementById('btn-reject-occurrence'), btnDelete = document.getElementById('btn-delete-permanent');
    const statusBar = document.getElementById('form-status-bar');
    
    const myRole = getUserRole();
    const myName = getCurrentUserName();

    inputColab.disabled = true; inputLider.disabled = true; inputInv.disabled = true;
    dataInputs.forEach(input => input.disabled = false);
    btnReject.classList.add('hidden'); btnDelete.classList.add('hidden');
    btnSave.classList.remove('hidden');

    if (status === 'draft') {
        statusBar.innerText = "Etapa 1: Preenchimento Inicial"; statusBar.className = "bg-indigo-900/40 text-indigo-200 px-4 py-3 text-xs font-bold uppercase tracking-wider text-center border-b border-indigo-500/20";
        inputInfrator.disabled = true; inputInfrator.placeholder = "Reservado ao Inventário"; inputInfrator.classList.add('opacity-50');
        inputColab.disabled = false; if (!inputColab.value) inputColab.value = myName;
        inputColab.className = 'w-full bg-slate-900 border border-indigo-900/50 rounded px-3 py-2 text-white text-sm focus:border-indigo-500';
        btnSave.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Assinar e Enviar`;
        if(currentOccurrenceId) { btnDelete.classList.remove('hidden'); btnDelete.innerText = "Excluir Rascunho"; }
    } else if (status === 'pendente_lider') {
        statusBar.innerText = "Etapa 2: Aprovação do Líder"; statusBar.className = "bg-amber-900/40 text-amber-200 px-4 py-3 text-xs font-bold uppercase tracking-wider text-center border-b border-amber-500/20";
        dataInputs.forEach(input => input.disabled = true);
        if (myRole === 'LIDER' || myRole === 'ADMIN') {
            inputLider.disabled = false; inputLider.value = myName;
            btnSave.innerText = "Aprovar e Enviar"; btnReject.classList.remove('hidden'); btnDelete.classList.remove('hidden'); btnDelete.innerText = "Excluir RNC";
        } else {
            inputLider.value = ""; inputLider.placeholder = "Aguardando Líder..."; btnSave.classList.add('hidden'); showToast("Aguardando aprovação da liderança.", "info");
        }
    } else if (status === 'pendente_inventario') {
        statusBar.innerText = "Etapa 3: Validação do Inventário"; statusBar.className = "bg-blue-900/40 text-blue-200 px-4 py-3 text-xs font-bold uppercase tracking-wider text-center border-b border-blue-500/20";
        dataInputs.forEach(input => input.disabled = false);
        if (myRole === 'INVENTARIO' || myRole === 'ADMIN') {
            inputInfrator.disabled = false; inputInfrator.classList.remove('opacity-50');
            inputInv.disabled = false; inputInv.value = myName;
            btnSave.innerText = "Validar e Finalizar"; btnReject.classList.remove('hidden'); btnDelete.classList.remove('hidden'); btnDelete.innerText = "Excluir RNC";
        } else {
            inputInv.value = ""; inputInv.placeholder = "Aguardando Inventário..."; btnSave.classList.add('hidden'); showToast("Aguardando validação do Inventário.", "info");
        }
    }
}

// --- Ações ---
async function handleSave() {
    const btn = document.getElementById('btn-save-occurrence'); btn.disabled = true; btn.innerText = "Processando...";
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
        if (currentOccurrenceId) await updateDoc(doc(currentCollectionRef, currentOccurrenceId), data); else await addDoc(currentCollectionRef, data);
        showToast("Relatório salvo!"); document.getElementById('ocorrencias-novo').classList.add('hidden'); document.getElementById('ocorrencias-menu-view').classList.remove('hidden');
    } catch(e) { console.error(e); showToast(e.message || "Erro.", "error"); } finally { btn.disabled = false; btn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> Salvar e Avançar`; }
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
    if (filteredOccurrencesData.length === 0) { showToast("Nenhum dado para exportar.", "error"); return; }
    const exportData = filteredOccurrencesData.map(d => {
        const dateObj = d.jsDate || new Date();
        let detalhesEmb = [];
        if(d.emb_amassada) detalhesEmb.push("Amassada");
        if(d.emb_rasgada) detalhesEmb.push("Rasgada");
        if(d.emb_vazamento) detalhesEmb.push("Vazamento");
        if(d.emb_outros) detalhesEmb.push(d.emb_outros);
        const tipoDetalhado = detalhesEmb.length > 0 ? detalhesEmb.join(", ") : "-";
        return {
            "DATA": dateObj.toLocaleDateString('pt-BR'), "MÊS": dateObj.toLocaleString('pt-BR', { month: 'long' }).toUpperCase(), "ANO": dateObj.getFullYear(),
            "ORIGEM / RESPONSÁVEL": d.infrator || '-', "IDENTIFICADOR": d.ass_colab || '-', "LOCAL": d.local || '-', "OCORRENCIA": d.tipo || '-', "TIPO OCORRENCIA": tipoDetalhado,
            "EMBARQUE": d.embarque || '-', "CLIENTE": d.nf || '-', "CÓDIGO": d.item_cod || '-', "DESCRIÇÃO DO ITEM": d.item_desc || '-', "LOTE": d.item_lote || '-', "QTD (CX)": d.item_qtd || '0', "ENDEREÇO": d.item_end || '-', "LIDER": d.ass_lider || '-', "INVENTÁRIO": d.ass_inv || '-', "OBSERVAÇÕES": d.obs || '-'
        };
    });
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    const wscols = [{wch: 12},{wch: 10},{wch: 6},{wch: 25},{wch: 20},{wch: 15},{wch: 15},{wch: 20},{wch: 15},{wch: 30},{wch: 15},{wch: 40},{wch: 15},{wch: 10},{wch: 15},{wch: 20},{wch: 20},{wch: 50}];
    ws['!cols'] = wscols;
    XLSX.utils.book_append_sheet(wb, ws, "Relatorio_RNC");
    const fileName = `Relatorio_RNC_${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.xlsx`;
    XLSX.writeFile(wb, fileName);
}

function printRncReport(id) {
    const item = [...pendingOccurrencesData, ...allOccurrencesData].find(d => d.id === id);
    if (!item) return showToast("Erro ao carregar dados.", "error");
    const check = (val) => val ? '☒ SIM' : '☐ NÃO';
    const displayNF = item.nf ? item.nf : '-';
    const content = `
        <div class="grid grid-cols-2 gap-4 mb-6"><div class="border p-2 rounded"><span class="block text-xs font-bold text-gray-500">EMBARQUE / CLIENTE</span><span class="text-lg">${item.embarque || '-'} / ${item.nf || '-'}</span></div><div class="border p-2 rounded"><span class="block text-xs font-bold text-gray-500">DATA OCORRÊNCIA</span><span class="text-lg">${item.jsDate.toLocaleDateString('pt-BR')}</span></div></div>
        <div class="mb-6"><h3 class="font-bold border-b border-gray-300 mb-2">DETALHES DA DIVERGÊNCIA</h3><table class="w-full mb-4"><tr><th width="20%">Tipo</th><td width="30%">${item.tipo}</td><th width="20%">Local</th><td width="30%">${item.local}</td></tr><tr><th>Item / Código</th><td colspan="3"><strong>${item.item_cod || '-'}</strong> - ${item.item_desc || ''}</td></tr><tr><th>Lote</th><td>${item.item_lote || '-'}</td><th>Quantidade (CX)</th><td>${item.item_qtd || '-'}</td></tr></table><h4 class="font-bold text-sm mt-4 mb-2">Condições da Embalagem</h4><div class="flex gap-4 text-sm border p-2 bg-gray-50"><span>${check(item.emb_amassada)} Amassada</span><span>${check(item.emb_rasgada)} Rasgada</span><span>${check(item.emb_vazamento)} Vazamento</span><span>Outros: ${item.emb_outros || '-'}</span></div></div>
        <div class="mb-6"><h3 class="font-bold border-b border-gray-300 mb-2">RELATO / OBSERVAÇÕES</h3><div class="border p-4 bg-gray-50 text-sm min-h-[80px]">${item.obs || 'Sem observações registradas.'}</div></div>
        <div class="mt-8"><h3 class="font-bold border-b border-gray-300 mb-4">VALIDAÇÕES E ASSINATURAS</h3><table class="w-full text-center"><tr><td width="33%" style="padding-top: 30px;"><div class="font-bold">${item.infrator || 'Não Identificado'}</div><div class="text-xs border-t mt-1 mx-4">Origem / Responsável</div></td><td width="33%" style="padding-top: 30px;"><div class="font-bold">${item.ass_lider || 'Pendente'}</div><div class="text-xs border-t mt-1 mx-4">Liderança</div></td><td width="33%" style="padding-top: 30px;"><div class="font-bold">${item.ass_inv || 'Pendente'}</div><div class="text-xs border-t mt-1 mx-4">Inventário (Conclusão)</div></td></tr></table></div>
    `;
    printDocument(`RNC - ${item.embarque || 'SN'} - ${item.tipo}`, content);
}

function renderAdminOccurrenceList() {
    const tbody = document.getElementById('admin-oc-list-tbody'); const searchInput = document.getElementById('admin-search-input'); const clearBtn = document.getElementById('admin-search-clear');
    if (!tbody || !searchInput) return;
    const searchTerm = searchInput.value.toLowerCase().trim();
    if(clearBtn) clearBtn.classList.toggle('hidden', searchTerm === '');
    tbody.innerHTML = '';
    const fullList = [...pendingOccurrencesData, ...allOccurrencesData];
    const uniqueList = Array.from(new Map(fullList.map(item => [item.id, item])).values());
    const filteredList = uniqueList.filter(item => { if (!searchTerm) return true; const clienteNF = (item.nf || '').toLowerCase(); const emb = (item.embarque || '').toLowerCase(); const tipo = (item.tipo || '').toLowerCase(); return clienteNF.includes(searchTerm) || emb.includes(searchTerm) || tipo.includes(searchTerm); });
    filteredList.sort((a, b) => b.jsDate - a.jsDate);
    if (filteredList.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-slate-500 italic">Nenhum registro encontrado.</td></tr>'; return; }
    filteredList.forEach(item => {
        const tr = document.createElement('tr'); tr.className = "hover:bg-slate-800 transition-colors border-b border-slate-800/50";
        let statusColor = item.status === 'concluido' ? "text-emerald-400 font-bold" : "text-amber-400";
        const displayNF = item.nf ? item.nf : '-';
        tr.innerHTML = `<td class="px-4 py-3 font-mono text-slate-300">${item.jsDate.toLocaleDateString('pt-BR')}</td><td class="px-4 py-3 font-bold text-white text-xs">${item.tipo}</td><td class="px-4 py-3 text-slate-300 text-xs">${item.embarque || '-'} <br> <span class="text-white font-medium">${displayNF}</span></td><td class="px-4 py-3 ${statusColor} uppercase text-[10px] tracking-wide">${item.status}</td><td class="px-4 py-3 text-right flex justify-end gap-2"><button class="text-slate-400 hover:text-white p-1.5 rounded transition btn-print-rnc" data-id="${item.id}" title="Imprimir Ficha"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg></button><button class="text-red-400 hover:text-red-200 bg-red-900/20 hover:bg-red-900/50 px-2 py-1.5 rounded transition btn-delete-individual flex items-center justify-center gap-1 text-[10px] border border-red-900/30" data-id="${item.id}" title="Excluir"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>Excluir</button></td>`;
        tbody.appendChild(tr);
    });
    const newBody = tbody.cloneNode(true); tbody.parentNode.replaceChild(newBody, tbody);
    newBody.querySelectorAll('.btn-delete-individual').forEach(btn => { btn.addEventListener('click', (e) => { const id = e.currentTarget.dataset.id; openConfirmModal("Excluir Definitivamente?", "Registro sumirá dos gráficos.", async () => { try { await deleteDoc(doc(currentCollectionRef, id)); showToast("Excluído."); closeConfirmModal(); } catch { showToast("Erro ao excluir.", "error"); } }); }); });
    newBody.querySelectorAll('.btn-print-rnc').forEach(btn => { btn.addEventListener('click', (e) => { const id = e.currentTarget.dataset.id; printRncReport(id); }); });
}

function updateDashboard() { applyDashboardFilters(); renderHistoryTable(); }
function applyDashboardFilters() {
    const startVal = document.getElementById('dash-filter-start').value; const endVal = document.getElementById('dash-filter-end').value;
    let startDate = startVal ? new Date(startVal + 'T00:00:00') : null; let endDate = endVal ? new Date(endVal + 'T23:59:59') : null;
    filteredOccurrencesData = allOccurrencesData.filter(d => { if(startDate && d.jsDate < startDate) return false; if(endDate && d.jsDate > endDate) return false; return true; });
    updateChartsAndStats(filteredOccurrencesData);
    renderHistoryTable();
}

function renderHistoryTable() {
    const tbody = document.getElementById('history-list-tbody'); const searchInput = document.getElementById('history-search-input'); const clearBtn = document.getElementById('history-search-clear'); if (!tbody) return;
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : "";
    if(clearBtn) clearBtn.classList.toggle('hidden', searchTerm === '');
    tbody.innerHTML = '';
    const listToRender = filteredOccurrencesData.filter(item => { if (!searchTerm) return true; const clienteNF = (item.nf || '').toLowerCase(); const emb = (item.embarque || '').toLowerCase(); const tipo = (item.tipo || '').toLowerCase(); return clienteNF.includes(searchTerm) || emb.includes(searchTerm) || tipo.includes(searchTerm); });
    if (listToRender.length === 0) { tbody.innerHTML = '<tr><td colspan="4" class="px-4 py-8 text-center text-slate-500 italic">Nenhum registro encontrado.</td></tr>'; return; }
    const finalLimit = searchTerm ? listToRender.length : 5;
    const truncatedList = listToRender.slice(0, finalLimit);
    truncatedList.forEach(item => {
        const tr = document.createElement('tr'); tr.className = "border-b border-slate-700 hover:bg-slate-750 transition-colors";
        const displayNF = item.nf ? item.nf : '-';
        tr.innerHTML = `<td class="px-4 py-3 font-mono text-slate-300 text-xs">${item.jsDate.toLocaleDateString('pt-BR')}</td><td class="px-4 py-3 text-white font-medium text-sm">${item.embarque || '-'} / ${displayNF}</td><td class="px-4 py-3 text-slate-300 text-xs">${item.tipo}</td><td class="px-4 py-3 text-right"><button class="text-slate-400 hover:text-white bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded transition btn-print-history flex items-center gap-2 ml-auto text-xs" data-id="${item.id}"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>Imprimir</button></td>`;
        tbody.appendChild(tr);
    });
    const newBody = tbody.cloneNode(true); tbody.parentNode.replaceChild(newBody, tbody);
    newBody.querySelectorAll('.btn-print-history').forEach(btn => { btn.addEventListener('click', (e) => { const id = e.currentTarget.dataset.id; printRncReport(id); }); });
}

function updateChartsAndStats(data) {
    // Mesma lógica anterior de gráficos (Copiada para manter integridade)
    let total = data.length; let types = { FALTA: 0, SOBRA: 0, AVARIA: 0, FALTA_INTERNA: 0 }; let locals = { ARMAZENAGEM: 0, ESTOQUE: 0, CHECKOUT: 0, SEPARAÇÃO: 0 }; let causadores = {}, identificadores = {};
    data.forEach(d => { if(types[d.tipo] !== undefined) types[d.tipo]++; if(locals[d.local] !== undefined) locals[d.local]++; const nmCausador = (d.infrator || 'Não Informado').trim().toUpperCase(); if(nmCausador) causadores[nmCausador] = (causadores[nmCausador] || 0) + 1; const nmIdentificador = (d.ass_colab || 'Não Informado').trim().toUpperCase(); if(nmIdentificador) identificadores[nmIdentificador] = (identificadores[nmIdentificador] || 0) + 1; });
    const elTotal = document.getElementById('dash-total-oc'); if(!elTotal) return;
    elTotal.innerText = total; document.getElementById('dash-last-date').innerText = (total > 0 && data[0].jsDate) ? data[0].jsDate.toLocaleDateString('pt-BR') : "-";
    let maxType = "-", maxVal = -1; for(const [k, v] of Object.entries(types)) if(v > maxVal && v > 0) { maxVal = v; maxType = k; }
    document.getElementById('dash-top-type').innerText = maxType;
    const createOrUpdateChart = (canvasId, config, currentInstance) => { const ctx = document.getElementById(canvasId); if (!ctx) return null; if (currentInstance) currentInstance.destroy(); return new Chart(ctx, config); };
    chartTypeInstance = createOrUpdateChart('chartOcType', { type: 'doughnut', data: { labels: ['Falta', 'Sobra', 'Avaria', 'Falta Interna'], datasets: [{ data: [types.FALTA, types.SOBRA, types.AVARIA, types.FALTA_INTERNA], backgroundColor: ['#ef4444', '#3b82f6', '#f59e0b', '#a855f7'], borderWidth: 0, borderRadius: 4 }] }, options: { responsive: true, plugins: { legend: { display: true, position: 'bottom', labels: { color: '#cbd5e1' } } } } }, chartTypeInstance);
    chartLocalInstance = createOrUpdateChart('chartOcLocal', { type: 'bar', data: { labels: ['Armazenagem', 'Estoque', 'Checkout', 'Separação'], datasets: [{ label: 'Qtd', data: [locals.ARMAZENAGEM, locals.ESTOQUE, locals.CHECKOUT, locals.SEPARAÇÃO], backgroundColor: '#6366f1', borderWidth: 0, borderRadius: 4 }] }, options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: '#334155' }, ticks: { color: '#cbd5e1' } }, x: { grid: { display: false }, ticks: { color: '#cbd5e1' } } } } }, chartLocalInstance);
    const sortObj = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const sCaus = sortObj(causadores); chartCausadorInstance = createOrUpdateChart('chartOcCausador', { type: 'bar', data: { labels: sCaus.map(i=>i[0]), datasets: [{ data: sCaus.map(i=>i[1]), backgroundColor: '#f43f5e', borderRadius: 4, barThickness: 20 }] }, options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, grid: { color: '#334155' }, ticks: { color: '#cbd5e1', stepSize: 1 } }, y: { grid: { display: false }, ticks: { color: '#cbd5e1', font: { size: 10 } } } } } }, chartCausadorInstance);
    const sIdent = sortObj(identificadores); chartIdentificadorInstance = createOrUpdateChart('chartOcIdentificador', { type: 'bar', data: { labels: sIdent.map(i=>i[0]), datasets: [{ data: sIdent.map(i=>i[1]), backgroundColor: '#10b981', borderRadius: 4, barThickness: 20 }] }, options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, grid: { color: '#334155' }, ticks: { color: '#cbd5e1', stepSize: 1 } }, y: { grid: { display: false }, ticks: { color: '#cbd5e1', font: { size: 10 } } } } } }, chartIdentificadorInstance);
}