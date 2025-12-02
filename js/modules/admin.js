/**
 * ARQUIVO: js/modules/admin.js
 * DESCRIÇÃO: Funcionalidades Administrativas (Importação, Exportação e Reset).
 */
import { writeBatch, doc, getDocs, addDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { safeBind, showToast, openConfirmModal, closeConfirmModal } from '../utils.js';
import { defaultChecklistData, specificClientRules } from '../config.js';

export function initAdminModule(db, clientsCollection) {
    
    // 1. Resetar Checklist (Área de Perigo)
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

    // 2. Baixar Modelo de Carregamento (O QUE ESTAVA FALTANDO)
    safeBind('download-template-btn', 'click', () => {
        const templateData = [{
            "name": "NOME DO CLIENTE EXEMPLO",
            "checklist": {
                "alturaPalete": { "directa": "1.80m", "fracionada": "1.80m" },
                "multiplosSKU": { "directa": "", "fracionada": "", "directaLimit": "", "fracionadaLimit": "" },
                "multiplosLotes": { "directa": "", "fracionada": "", "directaLimit": "", "fracionadaLimit": "" },
                "multiplosPedidos": { "directa": "Não", "fracionada": "Não", "directaLimit": "", "fracionadaLimit": "" },
                "paletizacaoLastro": { "directa": "", "fracionada": "" },
                "paletizacaoTorre": { "directa": "", "fracionada": "" },
                "tipoPalete": { "directa": "PBR", "fracionada": "PBR" },
                "observacao": { "directa": "", "fracionada": "" }
            }
        }];
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(templateData, null, 2));
        const a = document.createElement('a');
        a.setAttribute("href", dataStr);
        a.setAttribute("download", "modelo_importacao_applog.json");
        document.body.appendChild(a);
        a.click();
        a.remove();
    });

    // 3. Importar Carregamento (Arquivo JSON)
    safeBind('file-upload', 'change', (e) => {
        const file = e.target.files[0]; if (!file) return;
        const statusDiv = document.getElementById('import-status');
        const statusText = document.getElementById('import-status-text');
        
        statusDiv.classList.remove('hidden'); 
        statusText.innerText = "Analisando arquivo...";
        statusText.className = "text-sm text-yellow-400 font-mono";

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (!Array.isArray(data)) throw new Error("O arquivo JSON deve ser uma lista.");
                
                statusText.innerText = `Processando ${data.length} registros...`;
                
                // Busca clientes existentes para atualizar ou criar
                const existingNamesMap = new Map();
                const snapshot = await getDocs(clientsCollection);
                snapshot.forEach(doc => {
                    if(doc.data().name) existingNamesMap.set(doc.data().name.toUpperCase().trim(), doc.id);
                });

                const batch = writeBatch(db);
                let createdCount = 0; 
                let updatedCount = 0;

                data.forEach(client => {
                    if (client.name) {
                        const normalizedName = client.name.toString().toUpperCase().trim();
                        const existingId = existingNamesMap.get(normalizedName);
                        
                        if (existingId) { 
                            const docRef = doc(clientsCollection, existingId); 
                            batch.update(docRef, { checklist: client.checklist || defaultChecklistData }); 
                            updatedCount++; 
                        } else { 
                            const newDocRef = doc(clientsCollection); 
                            batch.set(newDocRef, { name: normalizedName, checklist: client.checklist || defaultChecklistData }); 
                            createdCount++; 
                        }
                    }
                });

                if (createdCount === 0 && updatedCount === 0) throw new Error("Nenhum dado válido.");
                
                statusText.innerText = `Salvando...`; 
                await batch.commit();
                
                showToast(`Sucesso! ${createdCount} criados, ${updatedCount} atualizados.`);
                statusText.innerText = "Concluído!"; 
                statusText.className = "text-sm text-emerald-400 font-mono";
                e.target.value = ''; 
                setTimeout(() => statusDiv.classList.add('hidden'), 4000);

            } catch (err) { 
                console.error(err); 
                showToast("Erro: " + err.message, 'error'); 
                statusText.innerText = "Falha: " + err.message; 
                statusText.className = "text-sm text-red-400 font-mono"; 
                e.target.value = ''; 
            }
        };
        reader.readAsText(file);
    });

    // 4. Baixar Modelo Equipe
    safeBind('download-users-template-btn', 'click', () => {
        const templateData = [{ "id": "COLE_O_UID_AQUI", "name": "Nome Colaborador", "role": "OPERADOR" }, { "id": "OUTRO_UID", "name": "Nome Líder", "role": "LIDER" }];
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(templateData, null, 2));
        const a = document.createElement('a'); a.href = dataStr; a.download = "modelo_equipe.json"; document.body.appendChild(a); a.click(); a.remove();
    });

    // 5. Importar Equipe
    safeBind('users-upload', 'change', (e) => {
        const file = e.target.files[0]; if (!file) return;
        const statusText = document.getElementById('users-import-status-text');
        document.getElementById('users-import-status').classList.remove('hidden');
        statusText.innerText = "Lendo arquivo...";
        
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (!Array.isArray(data)) throw new Error("JSON inválido (deve ser lista).");
                const batch = writeBatch(db);
                let count = 0;
                data.forEach(user => {
                    if (user.id && user.name && user.role) {
                        batch.set(doc(db, 'users', user.id.trim()), { name: user.name.trim(), role: user.role.toUpperCase().trim(), updatedAt: new Date() });
                        count++;
                    }
                });
                await batch.commit();
                showToast(`${count} usuários importados.`);
                statusText.innerText = "Sucesso!"; e.target.value = '';
            } catch (err) {
                showToast("Erro importação.", 'error');
                statusText.innerText = "Erro: " + err.message;
            }
        };
        reader.readAsText(file);
    });
}