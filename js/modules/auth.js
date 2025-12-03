/**
 * ARQUIVO: js/modules/auth.js
 * DESCRIÇÃO: Autenticação Obrigatória (Admin ou Genérica).
 */
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { ADMIN_IDS } from '../config.js';
import { showToast, safeBind } from '../utils.js';

let currentUser = null;
let currentUserRole = 'OPERADOR';
let currentUserName = ''; 

// E-mail da conta genérica (para não auto-preencher nome)
const GENERIC_EMAIL = "operador@applog.com"; 

export function initAuth(auth, initialToken, callbackEnv) {
    const db = getFirestore();

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Usuário logado: Carrega sistema
            document.getElementById('login-modal').classList.add('hidden'); // Garante que fecha modal
            handleUserLoaded(user, db, callbackEnv);
        } else {
            // Ninguém logado: FORÇA O LOGIN
            showLoginModal(true); // true = modo forçado (sem botão cancelar)
        }
    });

    setupLoginUI(auth);
}

async function handleUserLoaded(user, db, callbackEnv) {
    currentUser = user;
    document.getElementById('userIdDisplay').innerText = user.email || 'Usuário';

    const isAdminConfig = ADMIN_IDS.includes(user.uid);
    
    // Lógica de Nome e Cargo
    try {
        // 1. Verifica se é o Login Genérico
        if (user.email === GENERIC_EMAIL) {
            currentUserRole = 'OPERADOR';
            currentUserName = ''; // DEIXA VAZIO para obrigar digitação
        } else {
            // 2. Se não for genérico, tenta buscar perfil pessoal
            const userSnap = await getDoc(doc(db, 'users', user.uid));
            if (userSnap.exists()) {
                const data = userSnap.data();
                currentUserRole = data.role ? data.role.toUpperCase() : 'OPERADOR';
                currentUserName = data.name || '';
            } else {
                // Admin sem cadastro no 'users'
                currentUserRole = isAdminConfig ? 'ADMIN' : 'OPERADOR';
                currentUserName = isAdminConfig ? 'Administrador' : '';
            }
        }
    } catch (e) { console.log(e); }

    if (isAdminConfig) currentUserRole = 'ADMIN';

    // Atualiza UI
    const roleLabel = document.getElementById('user-role-label');
    roleLabel.innerText = user.email === GENERIC_EMAIL ? "Operação (Genérico)" : `Logado (${currentUserRole})`;
    document.getElementById('btn-logout').classList.remove('hidden');

    updateUIForRole(currentUserRole === 'ADMIN');
    
    const savedEnv = localStorage.getItem('appLog_env') || 'prod';
    if (callbackEnv) callbackEnv(savedEnv);
}

function showLoginModal(forced = false) {
    const modal = document.getElementById('login-modal');
    const btnClose = document.getElementById('btn-close-login');
    
    modal.classList.remove('hidden');
    
    if (forced) {
        // Esconde o botão cancelar se o login for obrigatório
        btnClose.classList.add('hidden');
    } else {
        btnClose.classList.remove('hidden');
    }
}

function setupLoginUI(auth) {
    // Abrir Modal (botão lateral)
    safeBind('btn-open-login', 'click', () => showLoginModal(false));

    // Fechar Modal
    safeBind('btn-close-login', 'click', (e) => {
        e.preventDefault();
        document.getElementById('login-modal').classList.add('hidden');
    });

    // Fazer Login
    safeBind('login-form', 'submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-pass').value;
        const btn = document.getElementById('btn-perform-login');
        
        btn.disabled = true; btn.innerText = "Entrando...";
        
        try {
            await signInWithEmailAndPassword(auth, email, pass);
            // O onAuthStateChanged cuidará do resto
        } catch (error) {
            console.error(error);
            showToast("E-mail ou senha inválidos.", "error");
            btn.disabled = false; btn.innerText = "Entrar";
        }
    });

    // Fazer Logout
    safeBind('btn-logout', 'click', async () => {
        try {
            await signOut(auth);
            // onAuthStateChanged vai disparar e abrir o modal de login forçado
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
    
    const action = isAdmin ? 'remove' : 'add';
    els.indicator.classList[action]('hidden');
    els.addBtn.classList[action]('hidden');
    els.dangerZone.classList[action]('hidden');
    if (els.navConfig) els.navConfig.classList[action]('hidden');
}

export function getCurrentUser() { return currentUser; }
export function getUserRole() { return currentUserRole; }
export function getCurrentUserName() { return currentUserName; }
export function checkIsAdmin() { return currentUserRole === 'ADMIN'; }
