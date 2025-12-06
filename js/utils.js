// ARQUIVO: js/utils.js
export function safeBind(id, event, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, handler);
}

export function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    let bgClass = type === 'error' ? 'bg-red-600' : 'bg-emerald-600';
    toast.className = `${bgClass} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 transform transition-all duration-300 translate-x-full opacity-0 min-w-[300px] z-50 border border-white/10`;
    toast.innerHTML = `<div class="font-medium text-sm">${message}</div>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.remove('translate-x-full', 'opacity-0'));
    setTimeout(() => { toast.classList.add('translate-x-full', 'opacity-0'); setTimeout(() => container.removeChild(toast), 300); }, 3500);
}

export function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => showToast("ID copiado!")).catch(() => showToast("Erro ao copiar ID", 'error'));
}

export function formatValue(v, l) { 
    if (!v) return '-'; 
    const vl = v.toLowerCase().trim(); 
    let h = v; 
    if (vl === 'sim') h = `<span class="text-emerald-400 font-bold">Sim</span>`; 
    else if (vl === 'não' || vl === 'nao') h = `<span class="text-red-400 font-bold">Não</span>`; 
    if (l) h += `<div class="text-xs text-slate-400 mt-1 bg-slate-800 px-2 py-0.5 rounded border border-slate-600 inline-block">Max: ${l}</div>`; 
    return h; 
}

let pendingConfirmAction = null;
export function openConfirmModal(t, m, a) { 
    document.getElementById('confirm-title').innerText = t; 
    document.getElementById('confirm-message').innerHTML = m; 
    pendingConfirmAction = a; 
    const mo = document.getElementById('confirm-modal'); 
    mo.classList.remove('hidden'); 
    setTimeout(() => { 
        mo.classList.remove('opacity-0'); 
        document.getElementById('confirm-modal-panel').classList.add('scale-100');
    }, 10); 
}

export function closeConfirmModal() { 
    const mo = document.getElementById('confirm-modal'); 
    mo.classList.add('opacity-0'); 
    document.getElementById('confirm-modal-panel').classList.remove('scale-100'); 
    setTimeout(() => { 
        mo.classList.add('hidden'); 
        pendingConfirmAction = null;
    }, 200); 
}

safeBind('confirm-btn-cancel', 'click', closeConfirmModal);
safeBind('confirm-btn-yes', 'click', () => { if (pendingConfirmAction) pendingConfirmAction(); });

window.showToast = showToast;
window.copyToClipboard = copyToClipboard;

/**
 * Abre uma janela de impressão com layout A4.
 */
export function printDocument(title, contentHTML) {
    const printWindow = window.open('', '_blank');
    
    // CORREÇÃO DE SEGURANÇA: Verifica se o popup foi bloqueado pelo navegador
    if (!printWindow) {
        showToast("Navegador bloqueou a janela! Permita popups para imprimir.", "error");
        return;
    }

    const htmlStructure = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>${title}</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap');
                body { 
                    font-family: 'Inter', sans-serif; 
                    padding: 40px; 
                    color: #1a202c; 
                    -webkit-print-color-adjust: exact; 
                    print-color-adjust: exact; 
                }
                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px; }
                th { 
                    text-align: left; padding: 8px 12px; border-bottom: 2px solid #cbd5e1; 
                    text-transform: uppercase; font-weight: 700; font-size: 10px; color: #64748b;
                }
                td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
                tr:last-child td { border-bottom: none; }
                .doc-header { 
                    display: flex; justify-content: space-between; align-items: flex-start; 
                    border-bottom: 1px solid #1e293b; padding-bottom: 20px; margin-bottom: 30px;
                }
                .logo-box { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
                .meta-box { text-align: right; font-size: 10px; color: #64748b; }
            </style>
        </head>
        <body>
            <div class="doc-header">
                <div>
                    <div class="logo-box">AppLog</div>
                    <div class="text-sm text-gray-500">Relatório Operacional</div>
                </div>
                <div class="meta-box">
                    <p><strong>DOCUMENTO INTERNO</strong></p>
                    <p>Impresso em: ${new Date().toLocaleString('pt-BR')}</p>
                    <p>${title}</p>
                </div>
            </div>
            <div class="content">${contentHTML}</div>
            <script>setTimeout(() => { window.print(); window.close(); }, 600);</script>
        </body>
        </html>
    `;

    // Agora é seguro acessar .document
    printWindow.document.write(htmlStructure);
    printWindow.document.close();
}

export async function requestNotificationPermission() {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
        await Notification.requestPermission();
    }
}

// Envia a notificação real com proteção contra erro de vibração
export function sendDesktopNotification(title, body) {
    if (Notification.permission === "granted") {
        
        // CORREÇÃO DO ERRO DE VIBRAÇÃO:
        // Só tenta vibrar se o navegador suportar E se o usuário já tiver interagido com a página
        if (navigator.vibrate) {
            // userActivation é a API moderna para checar interação
            if (navigator.userActivation && navigator.userActivation.hasBeenActive) {
                try { navigator.vibrate([200, 100, 200]); } catch(e) {}
            }
        }
        
        const notification = new Notification("AppLog - " + title, {
            body: body,
            icon: "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📦</text></svg>"
        });
        
        notification.onclick = () => {
            window.focus();
            notification.close();
        };
    }
}