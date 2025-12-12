import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
// NOVO: Importação do App Check (Segurança)
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app-check.js";
import { 
    initializeFirestore, 
    persistentLocalCache, 
    persistentMultipleTabManager,
    collection 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { firebaseConfig, PATHS } from './config.js';
import { safeBind } from './utils.js';
import { initAuth } from './modules/auth.js';
import { initLabelsModule } from './modules/labels.js';
import { initClientsModule } from './modules/clients.js';
import { initRncModule } from './modules/rnc.js';
import { initAdminModule } from './modules/admin.js';
import { initDashboard, startTVMode } from './modules/dashboard.js';

const app = initializeApp(firebaseConfig);

// =================================================================
// 🛡️ SEGURANÇA: APP CHECK
// =================================================================
// Isso garante que apenas o seu site oficial acesse o banco de dados.
// Você precisa pegar a "Chave do Site" (Site Key) no Console do Firebase > App Check.
try {
    // ATENÇÃO: Se você ainda não tem a chave, o site vai funcionar, mas avisará no console.
    // Quando criar a chave no Firebase, substitua 'SUA-CHAVE-RECAPTCHA-AQUI' por ela.
    const appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider('6LewvygsAAAAAFh2REyS-NyO3FI9KG6J0SjfrIoz'), 
        isTokenAutoRefreshEnabled: true
    });
} catch (e) {
    console.warn("App Check: Chave não configurada ou rodando em localhost sem token.");
}

const auth = getAuth(app);

// Inicialização do Banco com Cache Offline (PWA)
const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
    })
});

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
    safeBind('app-logo-btn', 'click', () => changePage('Inicio'));
    
    const lastPage = localStorage.getItem('appLog_lastPage') || 'dashboard';
    changePage(document.getElementById(lastPage) ? lastPage : 'dashboard');
}

function changePage(target) {
    if (target === 'tv-mode') {
        startTVMode();
        return;
    }

    localStorage.setItem('appLog_lastPage', target);
    document.querySelectorAll('.page-content').forEach(p => { 
        if(p.id !== 'tv-mode') {
            p.classList.remove('active'); 
            p.classList.add('hidden'); 
        }
    });
    const targetEl = document.getElementById(target);
    if (targetEl) { targetEl.classList.remove('hidden'); targetEl.classList.add('active'); }
    
    document.querySelectorAll('.nav-link').forEach(l => {
        if (l.dataset.page === 'tv-mode') return;
        l.classList.remove('bg-slate-800', 'text-indigo-400', 'border-indigo-500', 'shadow-sm');
        l.classList.add('text-slate-300', 'border-transparent', 'hover:text-white');
    });
    const activeLink = document.querySelector(`[data-page="${target}"]`);
    if (activeLink && target !== 'tv-mode') {
        activeLink.classList.remove('text-slate-300', 'border-transparent', 'hover:text-white');
        activeLink.classList.add('bg-slate-800', 'text-indigo-400', 'border-indigo-500', 'shadow-sm');
    }
    if (window.innerWidth < 768) document.getElementById('sidebar-content').classList.add('hidden');
}

function setEnvironment(env) {
    const isTest = env === 'test';
    const badge = document.getElementById('env-badge');
    if (badge) {
        badge.innerText = isTest ? "Teste" : "Produção";
        badge.className = isTest ? "text-[10px] uppercase tracking-wider font-bold text-amber-400 bg-amber-900/30 px-1.5 rounded border border-amber-800" : "text-[10px] uppercase tracking-wider font-bold text-emerald-400 bg-emerald-900/30 px-1.5 rounded border border-emerald-800";
    }
    
    if (isTest) {
        document.getElementById('test-mode-strip')?.classList.remove('hidden');
        document.getElementById('test-mode-bg-indicator')?.classList.remove('hidden');
        document.getElementById('test-tools-section')?.classList.remove('hidden');
        document.getElementById('dash-env-warning')?.classList.remove('hidden');
        document.getElementById('logo-bg')?.classList.add('bg-amber-600');
    } else {
        document.getElementById('test-mode-strip')?.classList.add('hidden');
        document.getElementById('test-mode-bg-indicator')?.classList.add('hidden');
        document.getElementById('test-tools-section')?.classList.add('hidden');
        document.getElementById('dash-env-warning')?.classList.add('hidden');
        document.getElementById('logo-bg')?.classList.remove('bg-amber-600');
    }
    const toggle = document.getElementById('env-toggle');
    if(toggle) toggle.checked = isTest;

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

    blindarInputsExcetoLogin();
});

function blindarInputsExcetoLogin() {
    const inputs = document.querySelectorAll('input, textarea');
    inputs.forEach(el => {
        if (el.closest('#login-form')) return;
        if (el.type === 'radio' || el.type === 'checkbox') return;
        if (el.name && el.name.includes('no_autofill')) return;

        const randomName = 'field_' + Math.random().toString(36).substring(7);
        el.setAttribute('name', randomName);
        el.setAttribute('autocomplete', 'off');
        el.setAttribute('data-lpignore', 'true'); 
        el.setAttribute('readonly', 'true');

        el.addEventListener('focus', function() { this.removeAttribute('readonly'); });
        el.addEventListener('blur', function() { this.setAttribute('readonly', 'true'); });
    });
}