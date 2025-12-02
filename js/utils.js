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