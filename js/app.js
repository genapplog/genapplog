// ARQUIVO: js/app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { firebaseConfig, PATHS } from './config.js';
import { safeBind } from './utils.js';
import { initAuth } from './modules/auth.js';
import { initLabelsModule } from './modules/labels.js';
import { initClientsModule } from './modules/clients.js';
import { initRncModule } from './modules/rnc.js';
import { initAdminModule } from './modules/admin.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

function setupNavigation() {
    safeBind('mobile-menu-btn', 'click', () => {
        const sb = document.getElementById('sidebar-content');
        sb.classList.toggle('hidden'); sb.classList.toggle('flex');
    });
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            changePage(link.dataset.page);
        });
    });
    safeBind('app-logo-btn', 'click', () => changePage('dashboard'));
    const lastPage = localStorage.getItem('appLog_lastPage') || 'dashboard';
    changePage(document.getElementById(lastPage) ? lastPage : 'dashboard');
}

function changePage(target) {
    localStorage.setItem('appLog_lastPage', target);
    document.querySelectorAll('.page-content').forEach(p => { p.classList.remove('active'); p.classList.add('hidden'); });
    const targetEl = document.getElementById(target);
    if (targetEl) { targetEl.classList.remove('hidden'); targetEl.classList.add('active'); }
    
    document.querySelectorAll('.nav-link').forEach(l => {
        l.classList.remove('bg-slate-800', 'text-indigo-400', 'border-indigo-500', 'shadow-sm');
        l.classList.add('text-slate-300', 'border-transparent', 'hover:text-white');
    });
    const activeLink = document.querySelector(`[data-page="${target}"]`);
    if (activeLink) {
        activeLink.classList.remove('text-slate-300', 'border-transparent', 'hover:text-white');
        activeLink.classList.add('bg-slate-800', 'text-indigo-400', 'border-indigo-500', 'shadow-sm');
    }
    if (window.innerWidth < 768) document.getElementById('sidebar-content').classList.add('hidden');
}

function setEnvironment(env) {
    const isTest = env === 'test';
    document.getElementById('env-badge').innerText = isTest ? "Teste" : "Produção";
    document.getElementById('env-badge').className = isTest ? "text-[10px] uppercase tracking-wider font-bold text-amber-400 bg-amber-900/30 px-1.5 rounded border border-amber-800" : "text-[10px] uppercase tracking-wider font-bold text-emerald-400 bg-emerald-900/30 px-1.5 rounded border border-emerald-800";
    
    if (isTest) {
        document.getElementById('test-mode-strip').classList.remove('hidden');
        document.getElementById('test-mode-bg-indicator').classList.remove('hidden');
        document.getElementById('promote-section').classList.remove('hidden');
        document.getElementById('dash-env-warning').classList.remove('hidden');
        document.getElementById('logo-bg').classList.add('bg-amber-600');
    } else {
        document.getElementById('test-mode-strip').classList.add('hidden');
        document.getElementById('test-mode-bg-indicator').classList.add('hidden');
        document.getElementById('promote-section').classList.add('hidden');
        document.getElementById('dash-env-warning').classList.add('hidden');
        document.getElementById('logo-bg').classList.remove('bg-amber-600');
    }
    document.getElementById('env-toggle').checked = isTest;

    const clientPath = isTest ? PATHS.test.clients : PATHS.prod.clients;
    const clientsCollection = collection(db, clientPath);
    
    initClientsModule(clientsCollection);
    initRncModule(db, isTest);
    initAdminModule(db, clientsCollection);
}

document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    initLabelsModule();
    initAuth(auth, null, (savedEnv) => { setEnvironment(savedEnv); });
    safeBind('env-toggle', 'change', (e) => {
        const newEnv = e.target.checked ? 'test' : 'prod';
        localStorage.setItem('appLog_env', newEnv);
        setEnvironment(newEnv);
    });
});