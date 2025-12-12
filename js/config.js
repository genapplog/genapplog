// ARQUIVO: js/config.js
export const firebaseConfig = {
    apiKey: "AIzaSyABGUTSwBMEuNLmFDsNRHgXOo3NEs8Q21A",
    authDomain: "genapplog.firebaseapp.com",
    projectId: "genapplog",
    storageBucket: "genapplog.firebasestorage.app",
    messagingSenderId: "787938700532",
    appId: "1:787938700532:web:442b667367341fb4ac02a1"
};

export const ADMIN_IDS = ["lssiHZQUGEMF9E2OPnv3iqIyjRW2"];

export const PATHS = {
    prod: { clients: `artifacts/${firebaseConfig.appId}/public/data/clients`, occurrences: `artifacts/${firebaseConfig.appId}/public/data/occurrences` },
    test: { clients: `artifacts/${firebaseConfig.appId}/public/data/clients_test`, occurrences: `artifacts/${firebaseConfig.appId}/public/data/occurrences_test` }
};

export const defaultChecklistData = { 
    alturaPalete: { directa: "1.80m", fracionada: "1.80m" }, 
    multiplosSKU: { directa: "", fracionada: "", directaLimit: "", fracionadaLimit: "" },
    multiplosLotes: { directa: "", fracionada: "", directaLimit: "", fracionadaLimit: "" },
    multiplosPedidos: { directa: "Não", fracionada: "Não", directaLimit: "", fracionadaLimit: "" },
    paletizacaoLastro: { directa: "", fracionada: "" },
    paletizacaoTorre: { directa: "", fracionada: "" },
    tipoPalete: { directa: "PBR", fracionada: "PBR" },
    observacao: { directa: "", fracionada: "" } 
};

export const checklistRowsConfig = [
    { key: 'alturaPalete', label: 'Altura Palete' },
    { key: 'multiplosSKU', label: 'Múltiplos SKU' },
    { key: 'multiplosLotes', label: 'Múltiplos Lotes' },
    { key: 'multiplosPedidos', label: 'Múltiplos Pedido / NF' },
    { key: 'paletizacaoLastro', label: 'Paletização Lastro' },
    { key: 'paletizacaoTorre', label: 'Paletização Torre' },
    { key: 'tipoPalete', label: 'Tipo Palete' },
    { key: 'observacao', label: 'Observação' }
];

export const specificClientRules = { "AMAZON": { ...defaultChecklistData, observacao: { directa: "Exige agendamento prévio (CARP).", fracionada: "Exige agendamento prévio (CARP)." } } };

export const cdData = { 
    "GRU5": { nome: "Amazon Servicos de Varejo do Brasil Ltda", cnpj: "15436940000367", ie: "241099810118 ", linha1: "Cd Prologis 3: Av. Antonio Candido Machado", linha2: "3100 Andar 5, 07776415 - Cajamar - SP   " },
    "XBRA": { nome: "Amazon Servicos de Varejo do Brasil Ltda", cnpj: "15436940000448", ie: "241118709114 ", linha1: "Cd Prologis 2: Av. Dr. Joao Abdalla 260   ", linha2: "Bloco 400, 07776700 - Cajamar - SP      " },
    "XBRB": { nome: "Amazon Servicos de Varejo do Brasil Ltda", cnpj: "15436940000529", ie: "0842859-07   ", linha1: "Rd Br-101 Sul, 3791bl C, Galpão 5, Sl A   ", linha2: "54503010 - Cabo De Santo Agostinho - PE " },
    "XBRT": { nome: "Amazon Servicos de Varejo do Brasil Ltda", cnpj: "15436940000871", ie: "241134643114 ", linha1: "Via De Acesso Norte KM 38, 420, Galpão 07 ", linha2: "Gleba A Bloco 07, 07789100 Cajamar - SP " },
    "XBRZ": { nome: "Amazon Servicos de Varejo do Brasil Ltda", cnpj: "15436940000286", ie: "241115791117 ", linha1: "Cd Prologis 2: Av. Dr. Joao Abdalla 260   ", linha2: "Bloco 300, 07776700 Cajamar - SP        " },
    "CNF1": { nome: "Amazon Servicos de Varejo do Brasil Ltda", cnpj: "15436940000952", ie: "002668590054 ", linha1: "Avenida Juiz Marco Tulio Isaac 7000       ", linha2: "32670250, Betim - MG                    " },
    "BSB1": { nome: "Amazon Servicos de Varejo do Brasil Ltda", cnpj: "15436940001096", ie: "0774927400365", linha1: "Rd Df, 290, Km 1.2 Lote 13,14,15,16 E 17 -", linha2: " 72501100, Brasilia - DF                " },
    "POA1": { nome: "Amazon Servicos de Varejo do Brasil Ltda", cnpj: "15436940001177", ie: "3820025709   ", linha1: "Rua Da Pedreira, 64, Pavilhão 05          ", linha2: "92480000, Nova Santa Rita - RS          " },
    "GIG1": { nome: "Amazon Servicos de Varejo do Brasil Ltda", cnpj: "15436940001410", ie: "11821987     ", linha1: "Av Arthur Antonio Sendas, S/N Area 6a     ", linha2: "25585021, Sao Joao De Meriti, RJ        " },
    "REC1": { nome: "Amazon Servicos de Varejo do Brasil Ltda", cnpj: "11543694000150", ie: "0920380-00   ", linha1: "RD BR 101 SUL, 9415, Galpão B             ", linha2: "54503010 - Cabo De Santo Agostinho - PE " },
    "FOR2": { nome: "Amazon Servicos de Varejo do Brasil Ltda", cnpj: "15436940001681", ie: "61268801     ", linha1: "Av Quarto Anel Viario, 4343               ", linha2: "61880000, Itaitinga - CE                " } 
};

export const labelDimensions = { 
    "4x6": { pw: 800, ll: 1200, aspect: "aspect-[2/3]" }, 
    "4x4": { pw: 800, ll: 800, aspect: "aspect-square" }, 
    "4x2": { pw: 800, ll: 400, aspect: "aspect-[2/1]" }, 
    "4x3.15": { pw: 800, ll: 640, aspect: "aspect-[10/8]" } 

};

// Configuração de Segurança para Validação Presencial
// Em produção, isso poderia vir do banco de dados de cada usuário.
export const SECURITY_CONFIG = {
    // Lista de Líderes e seus PINs individuais
    LEADERS_DB: [
        { name: "Líder Geral", pin: "2025" },
        { name: "João Silva", pin: "1111" },
        { name: "Maria Oliveira", pin: "2222" },
        { name: "Carlos Souza", pin: "3333" },
        // Adicione quantos quiser...
    ]
};