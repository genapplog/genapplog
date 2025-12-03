/**
 * ARQUIVO: js/modules/clients.js
 * DESCRIÇÃO: Gestão de Clientes e Checklists.
 */
import { onSnapshot, query, addDoc, updateDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { safeBind, showToast, openConfirmModal, closeConfirmModal, formatValue, printDocument } from '../utils.js';
import { defaultChecklistData, checklistRowsConfig } from '../config.js';
import { checkIsAdmin } from './auth.js';

let clientCache = new Map();
let currentEditingClientId = null;
let unsubscribeClients = null;

export function initClientsModule(collectionRef) {
    if (unsubscribeClients) unsubscribeClients();
    document.getElementById('client-list-tbody').innerHTML = '<tr><td colspan="2" class="px-6 py-12 text-center text-slate-400"><div class="flex justify-center items-center gap-2"><span class="spinner spinner-dark"></span><span>Carregando dados...</span></div></td></tr>';
    try {
        unsubscribeClients = onSnapshot(query(collectionRef), (snapshot) => {
            const clients = [];
            snapshot.forEach(doc => clients.push({ id: doc.id, ...doc.data() }));
            clients.sort((a, b) => a.name.localeCompare(b.name));
            clientCache.clear();
            clients.forEach(c => clientCache.set(c.id, c));
            filterAndRenderClients(collectionRef);
        });
    } catch (e) { console.error(e); }
    setupClientBindings(collectionRef);
}

function setupClientBindings(collectionRef) {
    safeBind('client-search', 'input', () => filterAndRenderClients(collectionRef));
    safeBind('clear-search-btn', 'click', () => { document.getElementById('client-search').value = ''; filterAndRenderClients(collectionRef); });
    
    safeBind('add-client-btn', 'click', () => { 
        document.getElementById('client-name').value = ''; 
        document.getElementById('client-modal').classList.remove('hidden'); 
        setTimeout(() => document.getElementById('client-modal').classList.remove('opacity-0'), 10); 
    });

    safeBind('client-form', 'submit', async (e) => { 
        e.preventDefault(); 
        const n = document.getElementById('client-name').value.trim(); 
        if (!n) return; 
        await addDoc(collectionRef, { name: n, checklist: defaultChecklistData }); 
        showToast("Cliente criado!"); 
        document.getElementById('client-modal').classList.add('hidden'); 
    });

    safeBind('client-modal-cancel', 'click', () => document.getElementById('client-modal').classList.add('hidden'));
    safeBind('client-modal-close-x', 'click', () => document.getElementById('client-modal').classList.add('hidden'));
    safeBind('view-back-btn', 'click', backToList);
    safeBind('edit-cancel-btn', 'click', backToList);
    
    safeBind('edit-save-btn', 'click', async () => { 
        const n = {}; 
        checklistRowsConfig.forEach(c => { 
            const d = document.querySelector(`[data-k="${c.key}"][data-f="directa"]`)?.value || ""; 
            const f = document.querySelector(`[data-k="${c.key}"][data-f="fracionada"]`)?.value || ""; 
            const dl = document.querySelector(`[data-k="${c.key}"][data-f="directaLimit"]`)?.value || ""; 
            const fl = document.querySelector(`[data-k="${c.key}"][data-f="fracionadaLimit"]`)?.value || ""; 
            n[c.key] = { directa: d, fracionada: f, directaLimit: dl, fracionadaLimit: fl }; 
        }); 
        await updateDoc(doc(collectionRef, currentEditingClientId), { checklist: n }); 
        showToast("Salvo!"); 
        backToList(); 
    });

    // 👇 IMPRESSÃO CLEAN (Branco e Preto)
    safeBind('view-print-btn', 'click', () => {
        const clientName = document.getElementById('view-client-name').innerText;
        const clientData = clientCache.get(currentEditingClientId)?.checklist || defaultChecklistData;
        
        let rowsHTML = '';
        checklistRowsConfig.forEach(conf => {
            const r = clientData[conf.key] || {};
            
            const fmt = (val) => {
                if (!val) return '-';
                if (val.toLowerCase() === 'sim') return '<strong>SIM</strong>';
                if (val.toLowerCase() === 'não' || val.toLowerCase() === 'nao') return 'NÃO';
                return val;
            };
            const limit = (val) => val ? `<br><span style="font-size:9px; color:#666;">Max: ${val}</span>` : '';

            rowsHTML += `
                <tr>
                    <td style="background-color: #f3f4f6; font-weight: bold; width: 30%;">${conf.label}</td>
                    <td style="width: 35%;">${fmt(r.directa)} ${limit(r.directaLimit)}</td>
                    <td style="width: 35%;">${fmt(r.fracionada)} ${limit(r.fracionadaLimit)}</td>
                </tr>
            `;
        });

        const content = `
            <div style="margin-bottom: 20px; padding: 15px; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px;">
                <strong style="font-size: 16px; display: block; margin-bottom: 4px;">Cliente: ${clientName}</strong>
                <span style="font-size: 12px; color: #4b5563;">Guia de Requisitos para Expedição de Carga</span>
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                <thead>
                    <tr style="background-color: #e5e7eb;">
                        <th style="padding: 8px; border: 1px solid #d1d5db; text-align: left;">Ponto de Vistoria</th>
                        <th style="padding: 8px; border: 1px solid #d1d5db; text-align: left;">Carga Direta</th>
                        <th style="padding: 8px; border: 1px solid #d1d5db; text-align: left;">Carga Fracionada</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHTML}
                </tbody>
            </table>
            <div style="margin-top: 20px; font-size: 10px; color: #6b7280; text-align: center;">
                * O não cumprimento destes requisitos pode ocasionar recusa no ato da entrega.
            </div>
        `;
        printDocument(`Ficha: ${clientName}`, content);
    });

    // Tabela
    const tbody = document.getElementById('client-list-tbody');
    if(tbody) {
        const newBody = tbody.cloneNode(true);
        tbody.parentNode.replaceChild(newBody, tbody);
        newBody.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const id = btn.dataset.id;
            if (btn.classList.contains('action-edit')) showEditMode(id);
            if (btn.classList.contains('action-view')) showViewMode(id);
            if (btn.classList.contains('action-delete')) {
                openConfirmModal("Excluir?", "Ação irreversível.", async () => { 
                    await deleteDoc(doc(collectionRef, id)); 
                    showToast("Removido."); 
                    closeConfirmModal(); 
                });
            }
        });
    }
}

function filterAndRenderClients(collectionRef) {
    const term = document.getElementById('client-search').value.toLowerCase().trim();
    const clearBtn = document.getElementById('clear-search-btn'); 
    if (clearBtn) clearBtn.classList.toggle('hidden', term.length === 0);
    const list = Array.from(clientCache.values()); 
    const filtered = term ? list.filter(c => c.name.toLowerCase().includes(term)) : list;
    const tbody = document.getElementById('client-list-tbody'); 
    tbody.innerHTML = '';
    if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="2" class="px-6 py-12 text-center text-slate-500">Nenhum cliente encontrado.</td></tr>'; return; }
    const isAdmin = checkIsAdmin();
    filtered.forEach(c => {
        const tr = document.createElement('tr'); 
        tr.className = "hover:bg-slate-800 transition-colors border-b border-slate-700";
        const actions = isAdmin ? 
            `<div class="flex justify-end items-center gap-4"><button class="text-slate-400 hover:text-white font-medium action-view transition-colors" data-id="${c.id}">Visualizar</button><button class="text-indigo-400 hover:text-indigo-300 font-medium action-edit transition-colors" data-id="${c.id}">Editar</button><button class="text-red-400 hover:text-red-300 font-medium action-delete transition-colors" data-id="${c.id}" data-name="${c.name}">Excluir</button></div>` : 
            `<div class="flex justify-end items-center"><button class="text-slate-400 hover:text-indigo-400 font-medium action-view" data-id="${c.id}">Visualizar</button></div>`;
        tr.innerHTML = `<td class="px-6 py-4 text-sm font-medium text-white">${c.name}</td><td class="px-6 py-4 text-right text-sm">${actions}</td>`;
        tbody.appendChild(tr);
    });
}

function showViewMode(id) { 
    const c = clientCache.get(id); 
    if (!c) return; 
    // Define o ID global de edição para que o botão de imprimir saiba quem é
    currentEditingClientId = id; 
    document.getElementById('view-client-name').innerText = c.name; 
    renderChecklistRows(document.getElementById('view-checklist-tbody'), c.checklist, false); 
    document.getElementById('client-list-section').classList.add('hidden'); 
    document.getElementById('client-view-section').classList.remove('hidden'); 
}

function showEditMode(id) { 
    const c = clientCache.get(id); 
    if (!c) return; 
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