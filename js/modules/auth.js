// ARQUIVO: js/modules/auth.js
import { onAuthStateChanged, signInAnonymously, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { ADMIN_IDS } from '../config.js';
import { showToast } from '../utils.js';

let currentUser = null;

export function initAuth(auth, initialToken, callbackEnv) {
    const doLogin = async () => {
        try {
            if (initialToken) await signInWithCustomToken(auth, initialToken);
            else await signInAnonymously(auth);
        } catch (e) {
            console.error(e);
            showToast("Erro conexão Auth", 'error');
        }
    };
    doLogin();

    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            document.getElementById('userIdDisplay').innerText = user.uid;
            const isAdmin = isUserAdmin(user.uid);
            updateUIForRole(isAdmin);
            const savedEnv = localStorage.getItem('appLog_env') || 'prod';
            if (callbackEnv) callbackEnv(savedEnv);
        }
    });
}

function isUserAdmin(uid) { return ADMIN_IDS.includes(uid); }

function updateUIForRole(isAdmin) {
    const els = { label: document.getElementById('user-role-label'), indicator: document.getElementById('admin-indicator'), addBtn: document.getElementById('add-client-btn'), resetBtn: document.getElementById('btn-reset-db'), dangerZone: document.getElementById('admin-danger-zone'), navConfig: document.getElementById('nav-link-config') };
    if (isAdmin) { els.label.innerText = "Admin (Teste)"; els.label.classList.add('text-green-400'); els.indicator.classList.remove('hidden'); els.addBtn.classList.remove('hidden'); els.dangerZone.classList.remove('hidden'); if (els.navConfig) els.navConfig.classList.remove('hidden'); } 
    else { els.label.innerText = "Leitor"; els.label.classList.add('text-slate-400'); els.indicator.classList.add('hidden'); els.addBtn.classList.add('hidden'); els.dangerZone.classList.add('hidden'); if (els.navConfig) els.navConfig.classList.add('hidden'); }
}

export function getCurrentUser() { return currentUser; }
export function checkIsAdmin() { return currentUser && isUserAdmin(currentUser.uid); }