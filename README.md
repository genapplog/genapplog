# 📦 AppLog - Sistema de Gestão Logística

Sistema PWA (Progressive Web App) desenvolvido internamente para otimização de processos de expedição, controle de divergências (RD) e geração de etiquetas logísticas.

## 🚀 Funcionalidades Principais

- **Dashboard Operacional:** Indicadores em tempo real de avarias, faltas e sobras.
- **Gestão de RNC:** Fluxo completo de Ocorrências (Rascunho -> Líder -> Inventário -> Concluído).
- **Etiquetas ZPL:** Integração com API Labelary para geração de etiquetas padrão Amazon e Manual.
- **Checklist Digital:** Validação de regras de carregamento por cliente.
- **Modo Offline:** Funciona como aplicativo instalado via Service Worker.

## 🛠️ Tecnologias

- **Frontend:** Vanilla JS (ES6 Modules), Tailwind CSS.
- **Backend:** Google Firebase (Firestore, Authentication).
- **Integrações:** Labelary API (ZPL), Chart.js (Dashboards), SheetJS (Excel).

## 📂 Estrutura do Projeto

O projeto utiliza arquitetura modular nativa sem bundlers:
- `/js/app.js`: Inicialização e Roteamento.
- `/js/modules/rnc.js`: Núcleo de lógica de divergências.
- `/js/modules/labels.js`: Gerador de ZPL.
- `/js/config.js`: Configurações de ambiente (Prod/Teste).

## ⚠️ Configuração

Para rodar localmente, é necessário um servidor HTTP simples (devido aos módulos ES6 e CORS):

1. Instale uma extensão como "Live Server" no VS Code.
2. Abra o arquivo `index.html`.
3. O sistema detectará automaticamente o ambiente (Produção ou Teste).

---
*Desenvolvido pela Equipe de Tecnologia & Logística.*
