/**
 * ARQUIVO: js/modules/labels.js
 * DESCRIÇÃO: Gerador de ZPL e Integração com API Labelary.
 */
import { safeBind, showToast } from '../utils.js';
import { labelDimensions, cdData } from '../config.js';

const baseApiUrl = 'https://api.labelary.com/v1/printers/8dpmm/labels/';

export function initLabelsModule() {
    console.log("Iniciando Módulo de Etiquetas...");

    // Navegação
    safeBind('btn-open-amazon', 'click', () => { document.getElementById('zpl-menu').classList.add('hidden'); document.getElementById('zpl-tool-amazon').classList.remove('hidden'); });
    safeBind('btn-back-zpl', 'click', () => { document.getElementById('zpl-tool-amazon').classList.add('hidden'); document.getElementById('zpl-menu').classList.remove('hidden'); });
    safeBind('btn-open-manual', 'click', () => { document.getElementById('zpl-menu').classList.add('hidden'); document.getElementById('zpl-tool-manual').classList.remove('hidden'); });
    safeBind('btn-back-zpl-manual', 'click', () => { document.getElementById('zpl-tool-manual').classList.add('hidden'); document.getElementById('zpl-menu').classList.remove('hidden'); });

    // Toggle Código
    safeBind('btn-toggle-zpl-amazon', 'click', () => document.getElementById('box-zpl-amazon').classList.toggle('hidden'));
    safeBind('btn-toggle-zpl-manual', 'click', () => document.getElementById('box-zpl-manual').classList.toggle('hidden'));

    // Limpeza Automática Chave NF
    const inputNf = document.getElementById('inputChaveNf');
    if (inputNf) {
        inputNf.removeAttribute('maxlength'); 
        inputNf.addEventListener('input', (e) => {
            let cleanValue = e.target.value.replace(/\D/g, '');
            if (cleanValue.length > 44) cleanValue = cleanValue.substring(0, 44);
            e.target.value = cleanValue;
        });
    }

    // Auto-preenchimento
    safeBind('inputQuantidadeTotal', 'input', (e) => { document.getElementById('inputCaixaFinal').value = e.target.value; });
    safeBind('inputManualQtdTotal', 'input', (e) => { document.getElementById('inputManualCaixaFim').value = e.target.value; });

    // Ações
    safeBind('generateButton', 'click', async () => handleGenerateAmazon());
    safeBind('generateButtonManual', 'click', async () => handleGenerateManual());
    
    safeBind('printButton', 'click', async () => handlePrintPDF('zplCode', 'selectTamanho', 'printButton'));
    safeBind('printButtonManual', 'click', async () => handlePrintPDF('zplCodeManual', null, 'printButtonManual', '4x3.15'));
}

function scaleY(value, labelLength) {
    const baseHeight = 1200;
    if (labelLength === baseHeight) return value;
    const scaled = Math.round((value / baseHeight) * labelLength);
    return scaled < 1 ? 1 : scaled;
}

function generateZplTemplate(dims, cdCode, cdInfo, nfKey, poNumber, currentBox, totalBoxes) {
    const volumeStr = `${currentBox}/${totalBoxes}`;
    const len = dims.ll;
    return `^XA^CI28^PW${dims.pw}^LL${dims.ll}^LH0,0^PO^FWB` +
           `^FO10,${scaleY(10,len)}^GB780,${scaleY(1180,len)},3^FS` +
           `^FO20,${scaleY(20,len)}^GB40,${scaleY(575,len)},3^FS^FO20,${scaleY(605,len)}^GB40,${scaleY(575,len)},3^FS` +
           `^FO70,${scaleY(20,len)}^GB220,${scaleY(575,len)},3^FS^FO70,${scaleY(605,len)}^GB220,${scaleY(575,len)},3^FS` +
           `^FO300,${scaleY(20,len)}^GB40,${scaleY(575,len)},3^FS^FO300,${scaleY(605,len)}^GB40,${scaleY(575,len)},3^FS` +
           `^FO350,${scaleY(20,len)}^GB180,${scaleY(575,len)},3^FS^FO350,${scaleY(605,len)}^GB180,${scaleY(575,len)},3^FS` +
           `^FO540,${scaleY(20,len)}^GB40,${scaleY(1160,len)},3^FS` +
           `^FO590,${scaleY(20,len)}^GB190,${scaleY(1160,len)},3^FS` +
           `^CFA,30^FO30,${scaleY(810,len)}^FH^FDEndereco de destino:^FS` +
           `^CFA,20^FO90,${scaleY(990,len)}^FH^FDAmazon CD: ${cdCode}^FS` +
           `^FO120,${scaleY(690,len)}^FH^FD${cdInfo.nome}^FS` +
           `^FO150,${scaleY(930,len)}^FH^FDCNPJ: ${cdInfo.cnpj}^FS` +
           `^FO180,${scaleY(965,len)}^FH^FDIE: ${cdInfo.ie}^FS` +
           `^FO210,${scaleY(665,len)}^FH^FD${cdInfo.linha1}^FS` +
           `^FO240,${scaleY(685,len)}^FH^FD${cdInfo.linha2}^FS` +
           `^CFA,30^FO30,${scaleY(170,len)}^FH^FDEndereco do fornecedor:^FS` +
           `^CFA,20^FO150,${scaleY(135,len)}^FH^FDESTRADA MUNICIPAL LUIZ LOPES NETO, 21^FS` +
           `^FO180,${scaleY(305,len)}^FH^FDEXTREMA - MG, 37640-050^FS` +
           `^CFA,30^FO310,${scaleY(860,len)}^FH^FDPedido de COMPRA:^FS` +
           `^BY2,3,${scaleY(100,len)}^FO380,${scaleY(740,len)}^BC,${scaleY(110,len)},,,,N^FH^FD${poNumber}^FS` +
           `^CFA,30^FO310,${scaleY(280,len)}^FH^FDNumero de caixas:^FS` +
           `^CFA,${scaleY(100,len)}^FO400,${scaleY(120,len)},^A0B,${scaleY(100,len)},${scaleY(100,len)}^FB400,1,0,C,0^FH^FD${volumeStr}\\&^FS` +
           `^CFA,30^FO550,${scaleY(950,len)}^FH^FDNota fiscal:^FS` +
           `^BY2,3,${scaleY(130,len)}^FO620,${scaleY(80,len)}^BC,${scaleY(120,len)},,,,N^FH^FD${nfKey}^FS^XZ`; 
}

function generateZplManualTemplate(data) { 
    return `^XA^MMT^PW799^LL640^LS1` +
           `^FO15,55^GB767,4,4^FS^FO15,115^GB767,4,4^FS^FO15,270^GB767,4,4^FS^FO15,440^GB767,4,4^FS^FO15,520^GB767,4,4^FS` +
           `^FT15,45^A0N,34,33^FH\\^FDGENOMMA MG ^FS^FT15,80^A0N,17,16^FH\\^FDDocumento^FS` +
           `^FT100,105^A0N,34,33^FH\\^FD${data.documento}^FS^FT415,80^A0N,17,16^FH\\^FDSolicitante^FS` +
           `^FT500,105^A0N,34,33^FH\\^FD${data.solicitante}^FS^FT15,155^A0N,17,16^FH\\^FDNota Fiscal^FS` +
           `^FT280,240^A0N,100,100^FH\\^FD${data.nf}^FS^FT15,305^A0N,17,16^FH\\^FDDestinatario^FS` +
           `^FT15,355^A0N,34,33^FH\\^FD${data.destinatario}^FS^FT15,400^A0N,23,24^FH\\^FD${data.cidade}^FS` +
           `^FT15,510^A0N,34,33^FH\\^FD${data.transportadora}^FS^FT15,470^A0N,17,16^FH\\^FDTransportador^FS` +
           `^FT15,555^A0N,17,16^FH\\^FDVolumes^FS^FT55,595^A0N,34,33^FH\\^FD${data.volAtual} / ${data.volTotal} CAIXA^FS^XZ`; 
}

async function handleGenerateAmazon() {
    const btn = document.getElementById('generateButton');
    const btnPrint = document.getElementById('printButton');
    const preview = document.getElementById('previewContainer');
    const zplArea = document.getElementById('zplCode');
    
    const sizeKey = document.getElementById('selectTamanho').value;
    const dimensionConfig = labelDimensions[sizeKey];
    const cdCode = document.getElementById('selectCdAmazon').value;
    const cdInfo = cdData[cdCode];
    const nfKey = document.getElementById('inputChaveNf').value;
    const poNumber = document.getElementById('inputPedido').value;
    
    const totalQty = parseInt(document.getElementById('inputQuantidadeTotal').value);
    const boxStart = parseInt(document.getElementById('inputCaixaInicial').value);
    const boxEnd = parseInt(document.getElementById('inputCaixaFinal').value);

    if (!cdInfo) { showToast("CD inválido", 'error'); return; }
    if (isNaN(boxStart) || isNaN(boxEnd) || isNaN(totalQty)) { showToast("Preencha números válidos", 'error'); return; }

    let fullZplBatch = ""; 
    for (let i = boxStart; i <= boxEnd; i++) {
        fullZplBatch += generateZplTemplate(dimensionConfig, cdCode, cdInfo, nfKey, poNumber, i, totalQty);
    }
    zplArea.value = fullZplBatch;

    const previewZpl = generateZplTemplate(dimensionConfig, cdCode, cdInfo, nfKey, poNumber, boxStart, totalQty);
    
    fetchPreview(sizeKey, previewZpl, btn, btnPrint, preview, 'Gerar Etiqueta', true);
    
    if(boxEnd > boxStart) showToast(`Lote de ${boxEnd - boxStart + 1} etiquetas gerado.`);
}

async function handleGenerateManual() {
    const btn = document.getElementById('generateButtonManual');
    const btnPrint = document.getElementById('printButtonManual');
    const preview = document.getElementById('previewContainerManual');
    const zplArea = document.getElementById('zplCodeManual');
    const sizeKey = "4x3.15";

    const docInput = document.getElementById('inputManualDocumento').value;
    const nfInput = document.getElementById('inputManualNf').value;
    const solicitanteInput = document.getElementById('inputManualSolicitante').value;
    const destInput = document.getElementById('inputManualDestinatario').value;
    const cidadeInput = document.getElementById('inputManualCidade').value;
    const transpInput = document.getElementById('inputManualTransportadora').value;
    
    const qtdTotal = parseInt(document.getElementById('inputManualQtdTotal').value) || 0;
    const boxStart = parseInt(document.getElementById('inputManualCaixaIni').value) || 1;
    const boxEnd = parseInt(document.getElementById('inputManualCaixaFim').value) || 1;

    if (qtdTotal <= 0) { showToast("Quantidade Total inválida", 'error'); return; }

    let fullZplBatch = ""; 
    for (let i = boxStart; i <= boxEnd; i++) {
        fullZplBatch += generateZplManualTemplate({ documento: docInput, nf: nfInput, solicitante: solicitanteInput, destinatario: destInput, cidade: cidadeInput, transportadora: transpInput, volAtual: i, volTotal: qtdTotal });
    }
    zplArea.value = fullZplBatch;

    const previewZpl = generateZplManualTemplate({ documento: docInput, nf: nfInput, solicitante: solicitanteInput, destinatario: destInput, cidade: cidadeInput, transportadora: transpInput, volAtual: boxStart, volTotal: qtdTotal });
    fetchPreview(sizeKey, previewZpl, btn, btnPrint, preview, 'Gerar Etiqueta', false);
}

async function fetchPreview(sizeKey, zpl, btn, btnPrint, previewContainer, btnText, rotate = false) {
    btn.disabled = true; btn.innerText = 'Gerando...'; 
    previewContainer.innerHTML = ''; // Limpa
    const spinner = document.createElement('span');
    spinner.className = 'spinner';
    previewContainer.appendChild(spinner);

    try {
        const response = await fetch(`${baseApiUrl}${sizeKey}/0/`, { method: 'POST', headers: { 'Accept': 'image/png', 'Content-Type': 'application/x-www-form-urlencoded' }, body: zpl });
        if (response.ok) {
            const imageUrl = URL.createObjectURL(await response.blob());
            previewContainer.innerHTML = ''; // Limpa spinner
            const img = document.createElement('img');
            img.src = imageUrl;
            img.className = "bg-white rounded-lg shadow-sm";
            img.style.cssText = rotate 
                ? 'transform: rotate(90deg) scale(0.55); transform-origin: center; width: auto; height: auto;' 
                : 'width: 100%; height: 100%; object-fit: contain;';
            previewContainer.appendChild(img);
            btnPrint.disabled = false;
        } else {
            previewContainer.innerHTML = '';
            const errSpan = document.createElement('span');
            errSpan.className = 'text-red-400 text-xs';
            errSpan.textContent = 'Erro API Labelary';
            previewContainer.appendChild(errSpan);
        }
    } catch { 
        previewContainer.innerHTML = '';
        const errSpan = document.createElement('span');
        errSpan.className = 'text-red-400 text-xs';
        errSpan.textContent = 'Erro de Rede';
        previewContainer.appendChild(errSpan);
    }
    finally { btn.disabled = false; btn.innerText = btnText; }
}

async function handlePrintPDF(zplId, sizeId, btnId, fixedSize) {
    const zplContent = document.getElementById(zplId).value;
    const sizeKey = fixedSize || document.getElementById(sizeId).value;
    const btn = document.getElementById(btnId);
    if (!zplContent) return;
    
    btn.disabled = true; btn.innerText = "Baixando...";
    try {
        const response = await fetch(`${baseApiUrl}${sizeKey}/`, { 
            method: 'POST', 
            headers: { 
                'Accept': 'application/pdf',
                'Content-Type': 'application/x-www-form-urlencoded' 
            }, 
            body: zplContent 
        });

        if (response.ok) window.open(URL.createObjectURL(await response.blob()), '_blank');
        else showToast("Erro ao gerar PDF completo", 'error');
    } catch { showToast("Erro na API de Impressão", 'error'); } 
    finally { 
        btn.disabled = false; 
        btn.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>Baixar PDF`; 
    }
}