/**
 * ARQUIVO: js/modules/auth.js
 * DESCRIÇÃO: Autenticação Híbrida (Anônima + E-mail/Senha).
 */
import { showToast, safeBind, requestNotificationPermission } from '../utils.js'; // <--- Adicione requestNotificationPermission
import { onAuthStateChanged, signInAnonymously, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { ADMIN_IDS } from '../config.js';


let currentUser = null;
let currentUserRole = 'OPERADOR';
let currentUserName = ''; // Nova variável para guardar o nome

export function initAuth(auth, initialToken, callbackEnv) {
    const db = getFirestore();

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            handleUserLoaded(user, db, callbackEnv);
        } else {
            signInAnonymously(auth).catch((e) => console.error("Erro anônimo", e));
        }
    });

    setupLoginUI(auth);
}

async function handleUserLoaded(user, db, callbackEnv) {
    // Pede permissão para notificar assim que carrega o usuário
    requestNotificationPermission(); 
    currentUser = user;
    document.getElementById('userIdDisplay').innerText = user.uid.slice(0, 15) + '...';

    const isAdminConfig = ADMIN_IDS.includes(user.uid);
    
    try {
        const userSnap = await getDoc(doc(db, 'users', user.uid));
        if (userSnap.exists()) {
            const data = userSnap.data();
            currentUserRole = data.role ? data.role.toUpperCase() : 'OPERADOR';
            currentUserName = data.name || 'Usuário'; // Pega o nome do banco
        } else {
            currentUserRole = 'OPERADOR';
            currentUserName = user.isAnonymous ? 'Operador Anônimo' : 'Admin (Sistema)';
        }
    } catch (e) { console.log(e); }

    if (isAdminConfig) {
        currentUserRole = 'ADMIN';
        if(currentUserName === 'Operador Anônimo') currentUserName = 'Administrador';
    }

    // Atualiza UI
    const roleLabel = document.getElementById('user-role-label');
    if (user.isAnonymous && !isAdminConfig) {
        roleLabel.innerText = "Operador (Anônimo)";
        document.getElementById('btn-logout').classList.add('hidden');
    } else {
        roleLabel.innerText = `Logado (${currentUserRole})`;
        document.getElementById('btn-logout').classList.remove('hidden');
    }

    updateUIForRole(currentUserRole === 'ADMIN');
    
    const savedEnv = localStorage.getItem('appLog_env') || 'prod';
    if (callbackEnv) callbackEnv(savedEnv);
}

function setupLoginUI(auth) {
    const modal = document.getElementById('login-modal');
    
    safeBind('btn-open-login', 'click', () => {
        if (currentUser && currentUser.uid) {
            navigator.clipboard.writeText(currentUser.uid)
                .then(() => showToast("ID de usuário copiado!", "info"))
                .catch(() => console.log("Erro ao copiar ID"));
        }
        if (!currentUser.isAnonymous) return; 
        modal.classList.remove('hidden');
    });

    safeBind('btn-close-login', 'click', (e) => {
        e.preventDefault();
        modal.classList.add('hidden');
    });

    safeBind('login-form', 'submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-pass').value;
        const btn = document.getElementById('btn-perform-login');
        
        btn.disabled = true; btn.innerText = "Entrando...";
        
        try {
            await signInWithEmailAndPassword(auth, email, pass);
            showToast("Bem-vindo de volta, Admin!");
            modal.classList.add('hidden');
        } catch (error) {
            console.error(error);
            showToast("E-mail ou senha inválidos.", "error");
        } finally {
            btn.disabled = false; btn.innerText = "Entrar";
        }
    });

    safeBind('btn-logout', 'click', async () => {
        try {
            await signOut(auth);
            showToast("Você saiu. Voltando para modo Operador.");
        } catch (e) { console.error(e); }
    });
}

function updateUIForRole(isAdmin) {
    const els = { 
        indicator: document.getElementById('admin-indicator'), 
        addBtn: document.getElementById('add-client-btn'), 
        dangerZone: document.getElementById('admin-danger-zone'), 
        navConfig: document.getElementById('nav-link-config') 
    };
    
    if (isAdmin) { 
        els.indicator.classList.remove('hidden'); 
        els.addBtn.classList.remove('hidden'); 
        els.dangerZone.classList.remove('hidden'); 
        if (els.navConfig) els.navConfig.classList.remove('hidden'); 
    } else { 
        els.indicator.classList.add('hidden'); 
        els.addBtn.classList.add('hidden'); 
        els.dangerZone.classList.add('hidden'); 
        if (els.navConfig) els.navConfig.classList.add('hidden'); 
    }
}

export function getCurrentUser() { return currentUser; }
export function getUserRole() { return currentUserRole; }
export function getCurrentUserName() { return currentUserName; } // Exportando o nome!
export function checkIsAdmin() { return currentUserRole === 'ADMIN'; }