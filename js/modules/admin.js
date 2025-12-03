/**
 * ARQUIVO: js/modules/admin.js
 * DESCRIÇÃO: Funcionalidades Administrativas (Importação, Exportação, Reset e Gestão de Produtos).
 */
import { writeBatch, doc, getDocs, deleteDoc, collection, query, where, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { safeBind, showToast, openConfirmModal, closeConfirmModal } from '../utils.js';
import { defaultChecklistData, specificClientRules } from '../config.js';

export function initAdminModule(db, clientsCollection) {
    
    // 1. Resetar Checklist
    safeBind('btn-reset-db', 'click', () => {
        openConfirmModal("Restaurar Padrões?", "PERIGO: Todos os checklists voltarão ao padrão de fábrica.", async () => {
            try {
                const s = await getDocs(clientsCollection);
                const b = writeBatch(db);
                s.forEach(d => {
                    const n = d.data().name?.toUpperCase().trim();
                    b.update(d.ref, { checklist: specificClientRules[n] || defaultChecklistData });
                });
                await b.commit();
                showToast("Padrões restaurados.");
            } catch { showToast("Erro ao restaurar.", 'error'); }
            closeConfirmModal();
        });
    });

    // 2. Clientes
    safeBind('download-template-btn', 'click', () => downloadJSON([{ "name": "CLIENTE EXEMPLO", "checklist": defaultChecklistData }], "modelo_clientes.json"));
    
    safeBind('file-upload', 'change', (e) => handleImport(e, db, 'clients', async (data, batch) => {
        const existingNames = new Map();
        (await getDocs(clientsCollection)).forEach(d => existingNames.set(d.data().name.toUpperCase().trim(), d.id));
        let count = 0;
        data.forEach(c => {
            if(c.name) {
                const id = existingNames.get(c.name.toUpperCase().trim());
                const ref = id ? doc(clientsCollection, id) : doc(clientsCollection);
                batch.set(ref, { name: c.name.toUpperCase().trim(), checklist: c.checklist || defaultChecklistData }, { merge: true });
                count++;
            }
        });
        return count;
    }, 'import-status'));

    // 3. Equipe
    safeBind('download-users-template-btn', 'click', () => downloadJSON([{ "id": "UID_FIREBASE", "name": "Nome", "role": "OPERADOR" }], "modelo_equipe.json"));
    
    safeBind('users-upload', 'change', (e) => handleImport(e, db, 'users', async (data, batch) => {
        let count = 0;
        data.forEach(u => {
            if(u.id && u.name) {
                batch.set(doc(db, 'users', u.id.trim()), { name: u.name.trim(), role: u.role?.toUpperCase() || 'LEITOR', updatedAt: new Date() });
                count++;
            }
        });
        return count;
    }, 'users-import-status'));

    // 4. PRODUTOS (Importação)
    safeBind('download-products-template-btn', 'click', () => downloadJSON([{ "dun": "17891000123456", "codigo": "200300", "descricao": "SHAMPOO TIO NACHO 400ML" }], "modelo_produtos.json"));

    safeBind('products-upload', 'change', (e) => handleImport(e, db, 'products', async (data, batch) => {
        let count = 0;
        data.forEach(p => {
            if(p.dun && p.codigo) {
                const cleanDun = p.dun.replace(/\D/g, '');
                batch.set(doc(db, 'products', cleanDun), { 
                    codigo: p.codigo.toString().trim(), 
                    descricao: p.descricao.toUpperCase().trim(),
                    updatedAt: new Date() 
                });
                count++;
            }
        });
        return count;
    }, 'products-import-status'));

    // 5. PRODUTOS (Busca e Exclusão Individual)
    setupProductSearch(db);
}

function setupProductSearch(db) {
    const btnSearch = document.getElementById('btn-search-product');
    const inputSearch = document.getElementById('product-search-input');
    const listContainer = document.getElementById('product-list-container');
    const tbody = document.getElementById('product-list-tbody');
    const msg = document.getElementById('product-search-msg');

    const doSearch = async () => {
        const term = inputSearch.value.toUpperCase().trim();
        if (term.length < 3) return showToast("Digite pelo menos 3 caracteres.", "info");
        
        // Limpa visual
        tbody.innerHTML = '<tr><td colspan="3" class="p-2 text-center">Buscando...</td></tr>';
        listContainer.classList.remove('hidden');
        msg.classList.add('hidden');

        try {
            const productsRef = collection(db, 'products');
            // O Firestore não tem busca "CONTÉM" nativa (LIKE). 
            // Vamos buscar tudo e filtrar no cliente (para bases pequenas < 2000 itens funciona bem)
            // Ou buscar direto pelo ID (DUN) se for numérico
            
            let results = [];
            
            // Se parece um DUN (só números), tenta buscar direto pelo ID
            if (/^\d+$/.test(term)) {
                const docSnap = await getDoc(doc(db, 'products', term));
                if (docSnap.exists()) results.push({ id: docSnap.id, ...docSnap.data() });
            }

            // Se não achou ou é texto, faz varredura (LIMITADA a 50 para não travar)
            if (results.length === 0) {
                const q = query(productsRef); // Pega tudo (cuidado em bases gigantes)
                const querySnapshot = await getDocs(q);
                querySnapshot.forEach((doc) => {
                    const d = doc.data();
                    // Filtro manual
                    if (doc.id.includes(term) || d.descricao.includes(term) || d.codigo.includes(term)) {
                        results.push({ id: doc.id, ...d });
                    }
                });
            }

            renderTable(results.slice(0, 10), db); // Mostra só os top 10

        } catch (e) {
            console.error(e);
            tbody.innerHTML = '<tr><td colspan="3" class="p-2 text-center text-red-400">Erro na busca.</td></tr>';
        }
    };

    const renderTable = (items, db) => {
        tbody.innerHTML = '';
        if (items.length === 0) {
            listContainer.classList.add('hidden');
            msg.classList.remove('hidden');
            return;
        }

        items.forEach(item => {
            const tr = document.createElement('tr');
            tr.className = "border-b border-slate-800 hover:bg-slate-800";
            tr.innerHTML = `
                <td class="p-2 font-mono text-orange-300">${item.id}</td>
                <td class="p-2">
                    <div class="font-bold text-white">${item.descricao}</div>
                    <div class="text-[10px] text-gray-500">Cód: ${item.codigo}</div>
                </td>
                <td class="p-2 text-right">
                    <button class="text-red-400 hover:text-white bg-red-900/20 hover:bg-red-600 p-1.5 rounded transition btn-del-prod" data-id="${item.id}" title="Excluir">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Bind delete buttons
        document.querySelectorAll('.btn-del-prod').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                openConfirmModal("Excluir Produto?", `DUN: ${id}`, async () => {
                    await deleteDoc(doc(db, 'products', id));
                    showToast("Produto excluído.");
                    closeConfirmModal();
                    doSearch(); // Refresh
                });
            });
        });
    };

    if(btnSearch) btnSearch.addEventListener('click', doSearch);
    if(inputSearch) inputSearch.addEventListener('keypress', (e) => { if(e.key === 'Enter') doSearch(); });
}

// Funções Auxiliares
function downloadJSON(data, filename) {
    const a = document.createElement('a');
    a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
}

function handleImport(event, db, collectionName, processFn, statusId) {
    const file = event.target.files[0]; if (!file) return;
    const statusDiv = document.getElementById(statusId);
    const statusText = document.getElementById(`${statusId}-text`);
    statusDiv.classList.remove('hidden'); statusText.innerText = "Lendo...";
    
    const reader = new FileReader();
    reader.onload = async (evt) => {
        try {
            const data = JSON.parse(evt.target.result);
            if (!Array.isArray(data)) throw new Error("Formato inválido. Use uma lista [].");
            const batch = writeBatch(db);
            const count = await processFn(data, batch);
            if(count > 0) await batch.commit();
            showToast(`${count} itens importados.`);
            statusText.innerText = "Sucesso!";
        } catch (e) { 
            console.error(e);
            showToast("Erro na importação.", 'error'); 
            statusText.innerText = "Erro: " + e.message;
        }
        event.target.value = '';
        setTimeout(() => statusDiv.classList.add('hidden'), 4000);
    };
    reader.readAsText(file);
}