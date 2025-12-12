/**
 * ARQUIVO: js/modules/clients.js
 * DESCRIÇÃO: Gestão de Clientes e Checklists.
 */
import { onSnapshot, query, addDoc, deleteDoc, doc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
// Importamos a nova função renderSkeleton
import { safeBind, showToast, openConfirmModal, closeConfirmModal, formatValue, printDocument, renderSkeleton } from '../utils.js';
import { defaultChecklistData, checklistRowsConfig } from '../config.js';
import { getUserRole } from './auth.js';
import { registerLog } from './admin.js';

let clientCache = new Map();
let currentEditingClientId = null;
let unsubscribeClients = null;
let currentCollectionRef = null;
let bindingsInitialized = false;

export function initClientsModule(collectionRef) {
    currentCollectionRef = collectionRef;

    if (unsubscribeClients) unsubscribeClients();

    const tbody = document.getElementById('client-list-tbody');
    // APLICAÇÃO DO ESQUELETO: 2 colunas, 5 linhas
    if (tbody) renderSkeleton(tbody, 2, 5);

    try {
        unsubscribeClients = onSnapshot(query(collectionRef), {
            next: (snapshot) => {
                const clients = [];
                snapshot.forEach(doc => clients.push({ id: doc.id, ...doc.data() }));
                clients.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                clientCache.clear();
                clients.forEach(c => clientCache.set(c.id, c));
                filterAndRenderClients();
            },
            error: (error) => {
                console.warn("Acesso negado:", error.code);
                const tb = document.getElementById('client-list-tbody');
                if (tb) tb.innerHTML = '<tr><td colspan="2" class="px-6 py-12 text-center text-slate-500 italic">Lista indisponível.</td></tr>';
            }
        });
    } catch (e) { console.error(e); }

    if (!bindingsInitialized) {
        setupClientBindings();
        bindingsInitialized = true;
    }
}

function setupClientBindings() {
    safeBind('client-search', 'input', () => filterAndRenderClients());
    safeBind('clear-search-btn', 'click', () => { document.getElementById('client-search').value = ''; filterAndRenderClients(); });

    safeBind('add-client-btn', 'click', () => {
        document.getElementById('client-name').value = '';
        document.getElementById('client-modal').classList.remove('hidden');
        setTimeout(() => document.getElementById('client-modal').classList.remove('opacity-0'), 10);
    });

    safeBind('client-form', 'submit', async (e) => {
        e.preventDefault();
        const n = document.getElementById('client-name').value.trim();
        if (!n) return;
        const btn = e.submitter || document.getElementById('client-modal-save');
        if(btn) btn.disabled = true;
        try {
            await addDoc(currentCollectionRef, { name: n, checklist: defaultChecklistData });
            registerLog('CRIAR_CLIENTE', n, 'Novo cliente');
            showToast("Cliente criado!");
            document.getElementById('client-modal').classList.add('hidden');
        } catch(err) { showToast("Erro.", "error"); } 
        finally { if(btn) btn.disabled = false; }
    });

    safeBind('client-modal-cancel', 'click', () => document.getElementById('client-modal').classList.add('hidden'));
    safeBind('client-modal-close-x', 'click', () => document.getElementById('client-modal').classList.add('hidden'));
    safeBind('view-back-btn', 'click', backToList);
    safeBind('edit-cancel-btn', 'click', backToList);

    safeBind('edit-save-btn', 'click', async () => {
        if (!currentCollectionRef || !currentEditingClientId) return;
        const n = {};
        checklistRowsConfig.forEach(c => {
            const d = document.querySelector(`[data-k="${c.key}"][data-f="directa"]`)?.value || "";
            const f = document.querySelector(`[data-k="${c.key}"][data-f="fracionada"]`)?.value || "";
            const dl = document.querySelector(`[data-k="${c.key}"][data-f="directaLimit"]`)?.value || "";
            const fl = document.querySelector(`[data-k="${c.key}"][data-f="fracionadaLimit"]`)?.value || "";
            n[c.key] = { directa: d, fracionada: f, directaLimit: dl, fracionadaLimit: fl };
        });
        await setDoc(doc(currentCollectionRef, currentEditingClientId), { checklist: n }, { merge: true });
        const cName = document.getElementById('edit-client-name').innerText;
        registerLog('EDITAR_CLIENTE', cName, 'Checklist alterado');
        showToast("Salvo!");
        backToList();
    });

    safeBind('view-print-btn', 'click', () => {
        const cName = document.getElementById('view-client-name').innerText;
        const cData = clientCache.get(currentEditingClientId)?.checklist || defaultChecklistData;
        let rowsHTML = '';
        checklistRowsConfig.forEach((conf, index) => {
            const r = cData[conf.key] || {};
            const isEven = index % 2 === 0 ? 'bg-slate-50' : 'bg-white';
            const fmt = (val) => {
                if (!val) return '<span class="text-slate-300">-</span>';
                if (val.toLowerCase() === 'sim') return '<span class="text-emerald-700 font-bold text-xs border border-emerald-200 bg-emerald-50 px-2 py-0.5 rounded">SIM</span>';
                if (val.toLowerCase() === 'não' || val.toLowerCase() === 'nao') return '<span class="text-red-700 font-bold text-xs border border-red-200 bg-red-50 px-2 py-0.5 rounded">NÃO</span>';
                return `<span class="text-slate-700 font-medium">${val}</span>`;
            };
            const limit = (val) => val ? `<div class="text-[9px] text-slate-500 mt-1">Limite: <span class="font-mono text-slate-700">${val}</span></div>` : '';
            rowsHTML += `<tr class="${isEven} border-b border-slate-200"><td class="py-3 px-4 text-xs font-bold text-slate-700 uppercase tracking-wide border-r border-slate-200 w-1/3">${conf.label}</td><td class="py-3 px-4 text-xs border-r border-slate-200 w-1/3 align-top">${fmt(r.directa)} ${limit(r.directaLimit)}</td><td class="py-3 px-4 text-xs w-1/3 align-top">${fmt(r.fracionada)} ${limit(r.fracionadaLimit)}</td></tr>`;
        });
        const content = `<div class="border-2 border-slate-800 rounded-lg overflow-hidden mb-6"><div class="bg-slate-800 text-white p-4 flex justify-between items-center"><div><h1 class="text-xl font-bold uppercase tracking-wider">Requisitos de Expedição</h1><p class="text-xs text-slate-300 mt-1">Guia Operacional</p></div><div class="text-right"><div class="text-2xl font-black text-white">${cName}</div></div></div></div><div class="mb-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tabela de Verificação</div><table class="w-full border-collapse border border-slate-200 rounded-lg overflow-hidden shadow-sm"><thead><tr class="bg-slate-100 border-b-2 border-slate-300"><th class="py-3 px-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider">Ponto de Vistoria</th><th class="py-3 px-4 text-left text-[10px] font-black text-indigo-600 uppercase tracking-wider bg-indigo-50/50">Carga Direta</th><th class="py-3 px-4 text-left text-[10px] font-black text-orange-600 uppercase tracking-wider bg-orange-50/50">Carga Fracionada</th></tr></thead><tbody>${rowsHTML}</tbody></table><div class="mt-8 flex gap-8"><div class="flex-1 border-t border-slate-400 pt-2"><p class="text-[10px] font-bold text-slate-500 uppercase mb-4">Assinatura Motorista</p></div><div class="flex-1 border-t border-slate-400 pt-2"><p class="text-[10px] font-bold text-slate-500 uppercase mb-4">Visto Expedição</p></div></div>`;
        printDocument(`REQ-${cName}`, content);
    });
}

function filterAndRenderClients() {
    const term = document.getElementById('client-search').value.toLowerCase().trim();
    const clearBtn = document.getElementById('clear-search-btn');
    if (clearBtn) clearBtn.classList.toggle('hidden', term.length === 0);

    const list = Array.from(clientCache.values());
    const filtered = term ? list.filter(c => c.name.toLowerCase().includes(term)) : list;
    const tbody = document.getElementById('client-list-tbody');
    if (!tbody) return;

    const newBody = document.createElement('tbody');
    newBody.id = 'client-list-tbody';
    newBody.className = "bg-slate-800 divide-y divide-slate-700";

    if (!filtered.length) {
        newBody.innerHTML = '<tr><td colspan="2" class="px-6 py-12 text-center text-slate-500">Nenhum cliente encontrado.</td></tr>';
    } else {
        const role = getUserRole();
        const canEdit = ['ADMIN', 'LIDER', 'INVENTARIO'].includes(role);
        const canDelete = role === 'ADMIN';

        filtered.forEach(c => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-800 transition-colors border-b border-slate-700";
            
            const tdName = document.createElement('td'); tdName.className = "px-6 py-4 text-sm font-medium text-white"; tdName.textContent = c.name;
            const tdActions = document.createElement('td'); tdActions.className = "px-6 py-4 text-right text-sm";
            const divActions = document.createElement('div'); divActions.className = "flex justify-end items-center gap-4";

            const makeBtn = (text, classes, id, extraDataset = {}) => {
                const btn = document.createElement('button'); btn.className = classes; btn.textContent = text; btn.dataset.id = id;
                for (const [key, val] of Object.entries(extraDataset)) btn.dataset[key] = val;
                return btn;
            };

            divActions.appendChild(makeBtn("Visualizar", "text-slate-400 hover:text-white font-medium action-view transition-colors", c.id));
            if (canEdit) divActions.appendChild(makeBtn("Editar", "text-indigo-400 hover:text-indigo-300 font-medium action-edit transition-colors", c.id));
            if (canDelete) divActions.appendChild(makeBtn("Excluir", "text-red-400 hover:text-red-300 font-medium action-delete transition-colors", c.id, { name: c.name }));

            tdActions.appendChild(divActions);
            tr.append(tdName, tdActions);
            newBody.appendChild(tr);
        });
    }
    tbody.parentNode.replaceChild(newBody, tbody);

    newBody.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const id = btn.dataset.id;
        if (btn.classList.contains('action-edit')) showEditMode(id);
        if (btn.classList.contains('action-view')) showViewMode(id);
        if (btn.classList.contains('action-delete')) {
            const name = btn.dataset.name || "Cliente";
            openConfirmModal("Excluir?", `Remover ${name}?`, async () => {
                if(!currentCollectionRef) return;
                await deleteDoc(doc(currentCollectionRef, id));
                registerLog('EXCLUIR_CLIENTE', name, 'Cliente removido');
                showToast("Removido.");
                closeConfirmModal();
            });
        }
    });
}

function showViewMode(id) {
    const c = clientCache.get(id); if (!c) return;
    currentEditingClientId = id;
    document.getElementById('view-client-name').innerText = c.name;
    renderChecklistRows(document.getElementById('view-checklist-tbody'), c.checklist, false);
    document.getElementById('client-list-section').classList.add('hidden');
    document.getElementById('client-view-section').classList.remove('hidden');
}

function showEditMode(id) {
    const c = clientCache.get(id); if (!c) return;
    currentEditingClientId = id;
    document.getElementById('edit-client-name').innerText = c.name;
    renderChecklistRows(document.getElementById('edit-checklist-tbody'), c.checklist, true);
    document.getElementById('client-list-section').classList.add('hidden');
    document.getElementById('client-edit-section').classList.remove('hidden');
}

function renderChecklistRows(tbody, data, isEditable) {
    tbody.innerHTML = '';
    const d = data || defaultChecklistData;
    checklistRowsConfig.forEach(conf => {
        const r = d[conf.key] || {};
        const tr = document.createElement('tr');
        if (!isEditable) {
            tr.innerHTML = `<td class="px-6 py-4 text-sm font-medium text-slate-300 bg-slate-800 border-r border-slate-700">${conf.label}</td><td class="px-6 py-4 text-sm text-slate-400 bg-blue-900/10 border-r border-slate-700">${formatValue(r.directa, r.directaLimit)}</td><td class="px-6 py-4 text-sm text-slate-400 bg-orange-900/10">${formatValue(r.fracionada, r.fracionadaLimit)}</td>`;
        } else {
            const iD = conf.key === 'observacao' ? `<textarea data-k="${conf.key}" data-f="directa" class="w-full bg-slate-900 border border-slate-600 text-white rounded p-2 text-sm" rows="2">${r.directa || ''}</textarea>` : `<input type="text" data-k="${conf.key}" data-f="directa" class="w-full bg-slate-900 border border-slate-600 text-white rounded p-2 text-sm" value="${r.directa || ''}">`;
            const iF = conf.key === 'observacao' ? `<textarea data-k="${conf.key}" data-f="fracionada" class="w-full bg-slate-900 border border-slate-600 text-white rounded p-2 text-sm" rows="2">${r.fracionada || ''}</textarea>` : `<input type="text" data-k="${conf.key}" data-f="fracionada" class="w-full bg-slate-900 border border-slate-600 text-white rounded p-2 text-sm" value="${r.fracionada || ''}">`;
            const lD = ['multiplosSKU', 'multiplosLotes', 'multiplosPedidos'].includes(conf.key) ? `<input type="text" data-k="${conf.key}" data-f="directaLimit" class="w-full border-slate-700 bg-slate-800 text-slate-300 rounded p-1 text-xs mt-2" placeholder="Limite" value="${r.directaLimit || ''}">` : '';
            const lF = ['multiplosSKU', 'multiplosLotes', 'multiplosPedidos'].includes(conf.key) ? `<input type="text" data-k="${conf.key}" data-f="fracionadaLimit" class="w-full border-slate-700 bg-slate-800 text-slate-300 rounded p-1 text-xs mt-2" placeholder="Limite" value="${r.fracionadaLimit || ''}">` : '';
            tr.innerHTML = `<td class="px-4 py-4 text-sm font-medium text-slate-300 w-1/3">${conf.label}</td><td class="px-4 py-4 bg-blue-900/10 w-1/3">${iD}${lD}</td><td class="px-4 py-4 bg-orange-900/10 w-1/3">${iF}${lF}</td>`;
        }
        tbody.appendChild(tr);
    });
}

function backToList() {
    document.getElementById('client-edit-section').classList.add('hidden');
    document.getElementById('client-view-section').classList.add('hidden');
    document.getElementById('client-list-section').classList.remove('hidden');
}