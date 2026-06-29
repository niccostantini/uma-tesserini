// Base path per nginx reverse proxy (es. /tesserini-UMA)
const API_BASE = '/tesserini-UMA';

// State management
let authToken = null;
let currentUser = null;
let currentTesseraId = null;
let currentPersonaId = null;
let eventi = [];
let tariffe = [];
let currentPage = 'main';
let currentSort = { field: 'created_at', order: 'desc' };
let tessereData = [];
let selectedTessere = new Set(); // Track selected tessere IDs
let isStampaInProgress = false;
let _tesseraCorrente     = null;
let _eventiCompleti      = [];
let _prezzoLabelCorrente = '';

// DOM elements
const loginSection = document.getElementById('loginSection');
const mainInterface = document.getElementById('mainInterface');
const userInfo = document.getElementById('userInfo');
const tesseraSection = document.getElementById('tesseraSection');

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    const savedToken = sessionStorage.getItem('umaToken');
    const savedUser = sessionStorage.getItem('umaUser');
    if (savedToken && savedUser) {
        authToken = savedToken;
        currentUser = JSON.parse(savedUser);
        showMainInterface();
    }

    loadEventi();
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('qrForm').addEventListener('submit', handleQRVerify);
    // statoForm rimosso dalla Cassa — lookup manuale disponibile nell'Admin
    document.getElementById('loadRedBtn').addEventListener('click', loadRedenzioni);
    document.getElementById('loadAnnullabiliBtn').addEventListener('click', loadAnnullabili);
    
    // Modal event listeners
    document.getElementById('revocaForm').addEventListener('submit', handleRevoca);
    document.getElementById('nuovoForm').addEventListener('submit', handleNuovoTesserino);
    
    // Set default exp date for new tessera
    const tomorrow = new Date();
    tomorrow.setFullYear(tomorrow.getFullYear() + 1);
    document.getElementById('expDateNuovo').value = tomorrow.toISOString().slice(0, 10);
}

// API helper function
async function apiCall(method, endpoint, data = null) {
    try {
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };

        if (authToken) {
            options.headers['Authorization'] = `Bearer ${authToken}`;
        }

        if (data !== null) {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(API_BASE + endpoint, options);

        if (response.status === 401 && authToken) {
            logout();
            throw new Error('Sessione scaduta, effettua nuovamente il login');
        }

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Errore di rete');
        }

        return result;
    } catch (error) {
        if (!(error.message && error.message.includes('Sessione scaduta'))) {
            console.error('API Error:', error);
        }
        throw error;
    }
}

// Show alert message
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

function showAlert(message, type = 'info', container = null) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
    
    if (container) {
        container.innerHTML = '';
        container.appendChild(alertDiv);
    }
    
    return alertDiv;
}

// Login handler
async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const resultContainer = document.getElementById('loginResult');

    if (!username || !password) {
        showAlert('Inserisci username e password', 'error', resultContainer);
        return;
    }

    try {
        const result = await apiCall('POST', '/auth/login', { username, password });
        authToken = result.token;
        currentUser = result.user;
        sessionStorage.setItem('umaToken', authToken);
        sessionStorage.setItem('umaUser', JSON.stringify(currentUser));
        document.getElementById('loginForm').reset();
        showMainInterface();
    } catch (error) {
        const msg = error.message === 'credenziali_non_valide'
            ? 'Username o password errati'
            : 'Errore: ' + error.message;
        showAlert(msg, 'error', resultContainer);
    }
}

// Logout
function logout() {
    authToken = null;
    currentUser = null;
    sessionStorage.removeItem('umaToken');
    sessionStorage.removeItem('umaUser');
    loginSection.classList.remove('hidden');
    mainInterface.classList.add('hidden');
    document.getElementById('navbar').style.display = 'none';
    document.getElementById('adminNavBtn').style.display = 'none';
    // Reset tutte le pagine
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.nav-btn[data-page="main"]').classList.add('active');
}

// Show main interface after login
function showMainInterface() {
    loginSection.classList.add('hidden');
    mainInterface.classList.remove('hidden');
    userInfo.textContent = `${currentUser.ruolo === 'admin' ? '👑 ' : ''}${currentUser.username}`;

    if (currentUser.ruolo === 'admin') {
        document.getElementById('adminNavBtn').style.display = 'inline-block';
    }

    loadEventi();
    loadTariffe();
    setupNavigation();
}

// Load eventi for select dropdown
async function loadEventi() {
    try {
        const result = await apiCall('GET', '/eventi');
        eventi = result.eventi;
        
        const select = document.getElementById('eventoSelect');
        if (select) {
            select.innerHTML = '<option value="">-- Scegli un evento --</option>';
            
            eventi.forEach(evento => {
                const option = document.createElement('option');
                option.value = evento.id;
                option.textContent = `${evento.nome} - ${evento.data} (Base: €${evento.prezzo_intero})`;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Errore caricamento eventi:', error);
        // Don't show error to user during initial load
    }
}

// QR verification handler
async function handleQRVerify(e) {
    e.preventDefault();
    const qr = document.getElementById('qrInput').value.trim();
    const resultContainer = document.getElementById('qrResult');
    
    if (!qr) {
        showAlert('Inserisci un codice QR', 'error', resultContainer);
        return;
    }
    
    try {
        // Verify QR
        const qrResult = await apiCall('POST', '/qr/verify', { qr });
        showAlert(`✅ QR Valido - ID: ${qrResult.id}`, 'success', resultContainer);
        
        currentTesseraId = qrResult.id;
        await loadTesseraInfo(qrResult.id);

    } catch (error) {
        showAlert(`QR non valido: ${error.message}`, 'error', resultContainer);
        tesseraSection.style.display = 'none';
        currentTesseraId = null;
    }
}

// Render eventi list with inline accredita buttons
function events_html(eventi, tesseraStato, prezzoLabel) {
    const attiva = tesseraStato === 'attivo';
    return eventi.map(ev => {
        const nomeEsc = ev.nome.replace(/"/g, '&quot;');

        // Evento in organico — mostra omaggio
        if (ev.in_organico) {
            const usato = !!ev.omaggio_id;
            const cls = `evento-item in-organico${usato ? ' omaggio-usato' : ''}`;
            const badge = usato
                ? `<span class="status-badge" style="background:#e8e8e8; color:var(--gray);">
                       Omaggio: ${ev.omaggio_beneficiario || 'ospite anonimo'}
                   </span>`
                : `<button type="button" class="btn-omaggio btn-small omaggio-btn"
                       data-evento-id="${ev.evento_id}"
                       data-evento-nome="${nomeEsc}"
                       data-strumentista-id="${ev._personaId || ''}">
                       Omaggio ospite
                   </button>`;
            return `
                <div class="${cls}">
                    <div style="flex:1; min-width:0;">
                        <strong>${ev.nome}</strong>
                        <small style="display:block; color:var(--green); margin-top:2px; font-weight:700; font-size:11px; text-transform:uppercase; letter-spacing:.04em;">Organico</small>
                        <small style="display:block; color:var(--gray); margin-top:1px;">${ev.data}${ev.luogo ? ' · ' + ev.luogo : ''}</small>
                    </div>
                    <div style="flex-shrink:0;">${badge}</div>
                </div>`;
        }

        // Evento normale
        return `
            <div class="evento-item ${ev.redento ? 'redento' : ''}">
                <div style="flex:1; min-width:0;">
                    <strong>${ev.nome}</strong>
                    <small style="display:block; color:var(--gray); margin-top:2px;">${ev.data}${ev.luogo ? ' · ' + ev.luogo : ''}</small>
                </div>
                <div style="flex-shrink:0;">
                    ${ev.redento
                        ? `<span class="status-badge status-success">Accreditato</span>`
                        : attiva
                            ? `<div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">
                                   <button type="button" class="btn-success btn-small accredita-btn"
                                       data-evento-id="${ev.evento_id}"
                                       data-evento-nome="${nomeEsc}">
                                       Accredita · ${ev._prezzoLabel || prezzoLabel}
                                   </button>
                                   <button type="button" class="btn-secondary btn-small da-terzi-btn"
                                       data-evento-id="${ev.evento_id}"
                                       data-evento-nome="${nomeEsc}">
                                       Da terzi
                                   </button>
                               </div>`
                            : `<span class="status-badge status-error">Tessera non attiva</span>`
                    }
                </div>
            </div>`;
    }).join('');
}

// Accredita (vendita + redenzione) per un evento specifico
async function handleVenditaForEvent(eventoId, eventoNome) {
    const btn = document.querySelector(`.accredita-btn[data-evento-id="${eventoId}"]`);
    const resultContainer = document.getElementById('venditaResult');
    if (btn) { btn.disabled = true; btn.textContent = '...'; }

    try {
        const result = await apiCall('POST', '/vendite', {
            tesserino_id: currentTesseraId,
            evento_id: eventoId,
            operatore: currentUser.username
        });
        showAlert(`Accreditato per "${eventoNome}" · €${result.prezzo}`, 'success', resultContainer);
        await loadTesseraInfo(currentTesseraId);
    } catch (error) {
        if (btn) { btn.disabled = false; btn.textContent = btn.textContent.replace('...', 'Accredita'); }
        if (error.message === 'duplicato' || error.message === 'persona_gia_accreditata') {
            showAlert(`Già accreditata per "${eventoNome}"`, 'info', resultContainer);
            await loadTesseraInfo(currentTesseraId);
        } else {
            showAlert(`Errore: ${error.message}`, 'error', resultContainer);
        }
    }
}

// Registra omaggio ospite per uno strumentista in organico
async function handleOmaggio(strumentistaId, eventoId, eventoNome) {
    const resultContainer = document.getElementById('venditaResult');
    const btn = document.querySelector(`.omaggio-btn[data-evento-id="${eventoId}"]`);
    if (btn) { btn.disabled = true; btn.textContent = '...'; }

    const nomeOspite = window.prompt(
        `Omaggio per "${eventoNome}"\n\nNome dell'ospite (lascia vuoto per anonimo):`,
        ''
    );
    // prompt restituisce null se l'utente preme Annulla
    if (nomeOspite === null) {
        if (btn) { btn.disabled = false; btn.textContent = 'Omaggio ospite'; }
        return;
    }

    try {
        await apiCall('POST', '/omaggi', {
            strumentista_id: strumentistaId,
            evento_id: eventoId,
            beneficiario_nome: nomeOspite.trim() || undefined
        });
        const label = nomeOspite.trim() ? `"${nomeOspite.trim()}"` : 'ospite anonimo';
        showAlert(`Omaggio registrato per ${label} · ${eventoNome}`, 'success', resultContainer);
        await loadTesseraInfo(currentTesseraId);
    } catch (error) {
        if (btn) { btn.disabled = false; btn.textContent = 'Omaggio ospite'; }
        if (error.message === 'omaggio_gia_registrato') {
            showAlert(`Omaggio già registrato per "${eventoNome}"`, 'info', resultContainer);
            await loadTesseraInfo(currentTesseraId);
        } else {
            showAlert(`Errore: ${error.message}`, 'error', resultContainer);
        }
    }
}

// Load tessera information
async function loadTesseraInfo(tesseraId) {
    try {
        const result = await apiCall('GET', `/tessere/${tesseraId}`);
        const tessera = result.tessera;
        const eventi = result.eventi;

        if (tessera.superpoteri) {
            await loadPresidenteCard(tessera, eventi);
            return;
        }
        
        const tariffaRow = tariffe.find(t => t.categoria === tessera.categoria);
        const discountPrice = tariffaRow ? parseFloat(tariffaRow.prezzo) : null;

        const prezzoLabel = discountPrice !== null ? `€${discountPrice.toFixed(2)}` : 'tariffa intera';

        // Fetch tariffe_evento per tutti gli eventi in parallelo → prezzo effettivo per-evento
        await Promise.all(eventi.map(async ev => {
            ev._personaId = tessera.persona_id;
            try {
                const r = await apiCall('GET', `/eventi/${ev.evento_id}/tariffe`);
                const override = r.tariffe.find(t => t.categoria === tessera.categoria);
                if (override !== undefined) {
                    ev._prezzoLabel = `€${parseFloat(override.prezzo).toFixed(2)}`;
                }
            } catch { /* usa prezzoLabel standard come fallback */ }
        }));

        // Salva stato per il filtro client-side
        _tesseraCorrente     = tessera;
        _eventiCompleti      = eventi;
        _prezzoLabelCorrente = prezzoLabel;

        const infoHtml = `
            <div class="tessera-info">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:16px; flex-wrap:wrap;">
                    <div>
                        <h4 style="font-size:20px; font-weight:800; margin-bottom:8px;">${tessera.nome}</h4>
                        <p style="margin-bottom:4px;"><strong>${tessera.categoria}</strong> · ${prezzoLabel} per evento</p>
                        <p style="margin-bottom:4px;">Scadenza: ${tessera.exp_date} · Doc: ${tessera.doc_verificato ? 'verificato' : 'non verificato'}</p>
                    </div>
                    <div style="display:flex; flex-direction:column; align-items:flex-end; gap:8px;">
                        <span class="status-badge ${tessera.stato === 'attivo' ? 'status-success' : 'status-error'}" style="font-size:13px; padding:6px 14px;">${tessera.stato.toUpperCase()}</span>
                        ${tessera.stato === 'attivo'
                            ? `<button type="button" class="btn-danger btn-small" id="revocaTesseraBtn">Revoca</button>`
                            : `<button type="button" class="btn-success btn-small" id="nuovoTesseraBtn" data-persona-id="${tessera.persona_id}">Nuovo Tesserino</button>`
                        }
                        <button type="button" class="btn-secondary btn-small stampa-singolo-btn"
                            data-id="${tessera.id}" data-nome="${tessera.nome.replace(/"/g,'&quot;')}" data-formato="a4">A4</button>
                        <button type="button" class="btn-secondary btn-small stampa-singolo-btn"
                            data-id="${tessera.id}" data-nome="${tessera.nome.replace(/"/g,'&quot;')}" data-formato="tessera">Tessera</button>
                    </div>
                </div>
            </div>

            <h3 style="margin-top:24px; margin-bottom:8px;">EVENTI</h3>
            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px; align-items:center;">
                <input type="text" id="filtroKeyword"  placeholder="Parola chiave" style="flex:2; min-width:130px;">
                <input type="date" id="filtroData"     style="flex:1; min-width:130px;">
                <input type="time" id="filtroOra"      style="flex:0 0 auto; min-width:100px;">
                <input type="text" id="filtroLocation" placeholder="Location"      style="flex:1; min-width:110px;">
            </div>
            <div id="eventiListContainer">
                ${eventi.length === 0
                    ? `<div class="alert alert-info">Nessun evento configurato — aggiungili dalla scheda Admin.</div>`
                    : events_html(eventi, tessera.stato, prezzoLabel)
                }
            </div>
            <div id="venditaResult" style="margin-top:16px;"></div>
        `;

        document.getElementById('tesseraInfo').innerHTML = infoHtml;
        tesseraSection.style.display = 'block';

        // Add event listeners for dynamic buttons
        setupTesseraButtons(tessera);

    } catch (error) {
        showAlert(`Errore caricamento tessera: ${error.message}`, 'error', document.getElementById('tesseraInfo'));
    }
}

// ── CARD PRESIDENZIALE ──────────────────────────────────────────────────────
let _pinResolve = null; // callback per il modale PIN

async function richiedePIN() {
    return new Promise((resolve) => {
        _pinResolve = resolve;
        const input = document.getElementById('pinInput');
        const errDiv = document.getElementById('pinError');
        input.value = '';
        errDiv.style.display = 'none';
        showModal('pinModal');
        setTimeout(() => input.focus(), 100);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('pinConfirmBtn').addEventListener('click', () => {
        const pin = document.getElementById('pinInput').value.trim();
        if (!pin) return;
        closeModal('pinModal');
        if (_pinResolve) { _pinResolve(pin); _pinResolve = null; }
    });
    document.getElementById('pinInput').addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('pinConfirmBtn').click();
        if (e.key === 'Escape') {
            closeModal('pinModal');
            if (_pinResolve) { _pinResolve(null); _pinResolve = null; }
        }
    });
});

async function loadPresidenteCard(tessera, eventi) {
    // Fetch storico accrediti presidenziali
    let storico = [];
    try {
        const rep = await apiCall('GET', '/presidente/report');
        storico = rep.ultimi || [];
    } catch (_) {}

    const evOptions = eventi.map(ev =>
        `<option value="${ev.evento_id}">${ev.nome} — ${new Date(ev.data).toLocaleDateString('it-IT')}</option>`
    ).join('');

    const storicoHtml = storico.length === 0
        ? '<p style="font-size:13px;color:var(--gray);">Nessun accredito speciale ancora registrato.</p>'
        : storico.slice(0, 15).map(a => {
            const isZero = parseFloat(a.prezzo_pagato) === 0;
            return `<div class="presidente-log-item">
                <span class="presidente-log-price ${isZero ? 'zero' : ''}">€${parseFloat(a.prezzo_pagato).toFixed(2)}</span>
                <span style="flex:1;">${a.beneficiario || '<em>anonimo</em>'} · ${a.evento_nome}</span>
                <span style="font-size:11px;color:var(--gray);">${new Date(a.creato_at).toLocaleString('it-IT',{dateStyle:'short',timeStyle:'short'})}</span>
            </div>`;
          }).join('');

    const html = `
        <div class="presidente-card">
            <div class="presidente-header">
                <span class="presidente-crown">👑</span>
                <div>
                    <div class="presidente-title">${tessera.nome}</div>
                    <div class="presidente-subtitle">Accrediti Speciali — ogni operazione richiede il PIN</div>
                </div>
            </div>

            <div class="presidente-form">
                <div class="form-group" style="margin:0;">
                    <label>Evento</label>
                    <select id="presEventoSelect">${evOptions}</select>
                </div>
                <div class="form-group" style="margin:0;">
                    <label>Beneficiario <span style="font-weight:400;color:var(--gray);">(opzionale)</span></label>
                    <input type="text" id="presBeneficiario" placeholder="Nome ospite — lascia vuoto per anonimo" maxlength="200" />
                </div>
                <div class="form-group" style="margin:0;">
                    <label>Prezzo pagato (€)</label>
                    <input type="number" id="presPrezzo" min="0" max="99" step="0.5" value="0" />
                </div>
                <div>
                    <button type="button" id="presAccreditoBtn" class="btn-primary">Concedi accredito</button>
                </div>
                <div id="presResult"></div>
            </div>

            <div class="presidente-history">
                <h4>Ultimi accrediti speciali</h4>
                <div id="presStorico">${storicoHtml}</div>
            </div>
        </div>
    `;

    document.getElementById('tesseraInfo').innerHTML = html;
    tesseraSection.style.display = 'block';

    document.getElementById('presAccreditoBtn').addEventListener('click', async () => {
        const eventoId   = document.getElementById('presEventoSelect').value;
        const beneficiario = document.getElementById('presBeneficiario').value.trim() || null;
        const prezzo     = parseFloat(document.getElementById('presPrezzo').value);
        const resultDiv  = document.getElementById('presResult');

        if (!eventoId) return showAlert('Seleziona un evento', 'error', resultDiv);
        if (isNaN(prezzo) || prezzo < 0) return showAlert('Prezzo non valido', 'error', resultDiv);

        const pin = await richiedePIN();
        if (!pin) return; // annullato

        try {
            const res = await apiCall('POST', '/presidente/accredito', {
                evento_id: eventoId,
                beneficiario,
                prezzo_pagato: prezzo,
                pin
            });
            showAlert(`✅ Accredito concesso · ${res.evento_nome} · €${prezzo.toFixed(2)}`, 'success', resultDiv);
            document.getElementById('presBeneficiario').value = '';
            document.getElementById('presPrezzo').value = '0';
            // Ricarica storico
            const rep = await apiCall('GET', '/presidente/report');
            const ultimi = (rep.ultimi || []).slice(0, 15);
            document.getElementById('presStorico').innerHTML = ultimi.length === 0
                ? '<p style="font-size:13px;color:var(--gray);">Nessun accredito speciale ancora registrato.</p>'
                : ultimi.map(a => {
                    const isZero = parseFloat(a.prezzo_pagato) === 0;
                    return `<div class="presidente-log-item">
                        <span class="presidente-log-price ${isZero ? 'zero' : ''}">€${parseFloat(a.prezzo_pagato).toFixed(2)}</span>
                        <span style="flex:1;">${a.beneficiario || '<em>anonimo</em>'} · ${a.evento_nome}</span>
                        <span style="font-size:11px;color:var(--gray);">${new Date(a.creato_at).toLocaleString('it-IT',{dateStyle:'short',timeStyle:'short'})}</span>
                    </div>`;
                  }).join('');
        } catch (error) {
            const errMap = {
                pin_non_valido:             '❌ PIN non corretto',
                troppi_tentativi:           '❌ Troppi tentativi — riprova tra 15 minuti',
                evento_non_trovato:         '❌ Evento non trovato',
                prezzo_superiore_al_massimo:'❌ Prezzo superiore alla tariffa massima',
            };
            showAlert(errMap[error.message] || `❌ Errore: ${error.message}`, 'error', resultDiv);
        }
    });
}

// Vendita handler
async function handleVendita(e) {
    e.preventDefault();
    const eventoId = document.getElementById('eventoSelect').value;
    const resultContainer = document.getElementById('venditaResult');
    
    if (!eventoId || !currentTesseraId || !currentUser) {
        showAlert('Seleziona un evento e verifica prima il QR', 'error', resultContainer);
        return;
    }
    
    try {
        const result = await apiCall('POST', '/vendite', {
            tesserino_id: currentTesseraId,
            evento_id: eventoId,
            operatore: currentUser.username
        });
        
        showAlert(`✅ Vendita completata! Prezzo: €${result.prezzo}`, 'success', resultContainer);
        
        // Reload tessera info to show updated status
        await loadTesseraInfo(currentTesseraId);
        
    } catch (error) {
        if (error.message === 'duplicato' || error.message === 'persona_gia_accreditata') {
            showAlert('Già accreditata per questo evento', 'info', resultContainer);
            await loadTesseraInfo(currentTesseraId);
        } else if (error.message === 'tessera_non_attiva') {
            showAlert('❌ Tessera non attiva o revocata', 'error', resultContainer);
        } else {
            showAlert(`❌ Errore vendita: ${error.message}`, 'error', resultContainer);
        }
    }
}


// Handle stato tessera
async function loadStatoTessera(tesseraId) {
    const result = await apiCall('GET', `/tessere/${tesseraId}`);
    const tessera = result.tessera;
    const eventi = result.eventi;

    const infoHtml = `
        <div class="tessera-info">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:8px;">
                <div>
                    <strong style="font-size:17px;">${tessera.nome}</strong>
                    <span style="color:var(--gray); margin-left:8px;">${tessera.categoria}</span>
                </div>
                <span class="status-badge ${tessera.stato === 'attivo' ? 'status-success' : 'status-error'}">${tessera.stato.toUpperCase()}</span>
            </div>
            <p style="color:var(--gray); font-size:13px;">Scadenza: ${tessera.exp_date} · Doc: ${tessera.doc_verificato ? 'verificato' : 'non verificato'}</p>
        </div>
        <div style="margin-top:12px;">
            ${eventi.length === 0
                ? `<p style="color:var(--gray);">Nessun evento configurato.</p>`
                : eventi.map(ev => `
                    <div class="evento-item ${ev.redento ? 'redento' : ''}">
                        <div>
                            <strong>${ev.nome}</strong><br>
                            <small>${ev.data}</small>
                        </div>
                        <div>
                            ${ev.redento
                                ? '<span class="status-badge status-success">Accreditato</span>'
                                : '<span class="status-badge status-warning">Disponibile</span>'}
                        </div>
                    </div>
                `).join('')
            }
        </div>
    `;
    document.getElementById('statoResult').innerHTML = infoHtml;
}

async function handleStatoTessera(e) {
    e.preventDefault();
    const tesseraId = document.getElementById('tesseraIdInput').value.trim();
    const resultContainer = document.getElementById('statoResult');

    if (!tesseraId) {
        showAlert('Inserisci un ID tessera', 'error', resultContainer);
        return;
    }

    try {
        await loadStatoTessera(tesseraId);
    } catch (error) {
        showAlert(`Tessera non trovata: ${error.message}`, 'error', resultContainer);
    }
}

// Load redenzioni
async function loadRedenzioni() {
    const resultContainer = document.getElementById('redenzioniResult');
    
    try {
        const result = await apiCall('GET', '/redenzioni');
        const redenzioni = result.redenzioni;
        
        if (redenzioni.length === 0) {
            showAlert('Nessun accredito registrato', 'info', resultContainer);
            return;
        }
        
        const tableHtml = `
            <table class="table">
                <thead>
                    <tr>
                        <th>Orario</th>
                        <th>Persona</th>
                        <th>Evento</th>
                        <th>Portatore</th>
                        <th>Stato</th>
                    </tr>
                </thead>
                <tbody>
                    ${redenzioni.slice(0, 20).map(r => `
                        <tr>
                            <td>${new Date(r.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</td>
                            <td>${r.persona_nome || r.tesserino_id.substring(0, 8) + '...'}</td>
                            <td>${r.evento_nome}</td>
                            <td>${r.presentato_da_nome
                                ? `<span style="color:var(--blue); font-size:13px;">${r.presentato_da_nome}</span>`
                                : '<span style="color:var(--gray); font-size:12px;">—</span>'
                            }</td>
                            <td>
                                ${r.annullata ?
                                    `<span class="status-badge status-error">Annullato</span>` :
                                    `<span class="status-badge status-success">Attivo</span>`
                                }
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        
        resultContainer.innerHTML = tableHtml;
        
    } catch (error) {
        showAlert(`Errore caricamento accrediti: ${error.message}`, 'error', resultContainer);
    }
}

// Load redenzioni annullabili
async function loadAnnullabili() {
    const resultContainer = document.getElementById('annullabiliResult');
    
    try {
        const result = await apiCall('GET', '/redenzioni/annullabili');
        const redenzioni = result.redenzioni;
        
        if (redenzioni.length === 0) {
            showAlert('Nessun accredito annullabile (ultimi 7 giorni)', 'info', resultContainer);
            return;
        }

        const tableHtml = `
            <div style="margin-bottom: 1rem;">
                <div class="alert-info">
                    <strong>Attenzione:</strong> Puoi annullare solo accrediti degli ultimi 7 giorni.<br>
                    <small>Trovati ${redenzioni.length} accrediti annullabili</small>
                </div>
            </div>
            <table class="table">
                <thead>
                    <tr>
                        <th>Orario</th>
                        <th>Persona</th>
                        <th>Evento</th>
                        <th>Portatore</th>
                        <th>Azioni</th>
                    </tr>
                </thead>
                <tbody>
                    ${redenzioni.map(r => `
                        <tr>
                            <td>${new Date(r.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</td>
                            <td>
                                <strong>${r.persona_nome}</strong><br>
                                <small style="color:var(--gray);">${r.categoria}</small>
                            </td>
                            <td>${r.evento_nome}</td>
                            <td>${r.presentato_da_nome
                                ? `<span style="color:var(--blue); font-size:13px;">${r.presentato_da_nome}</span>`
                                : '<span style="color:var(--gray); font-size:12px;">—</span>'
                            }</td>
                            <td>
                                <button class="btn-danger btn-small annulla-redenzione-btn"
                                        data-redenzione-id="${r.id}"
                                        data-persona-nome="${r.persona_nome}"
                                        data-evento-nome="${r.evento_nome}">
                                    Annulla
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        
        resultContainer.innerHTML = tableHtml;
        
        // Setup event listeners for annulla buttons
        setupAnnullaButtons();
        
    } catch (error) {
        showAlert(`Errore caricamento accrediti: ${error.message}`, 'error', resultContainer);
    }
}

// Setup event listeners for annulla buttons
function setupAnnullaButtons() {
    const buttons = document.querySelectorAll('.annulla-redenzione-btn');
    buttons.forEach(button => {
        button.addEventListener('click', async (e) => {
            const redenzioneId = e.target.dataset.redenzioneId;
            const personaNome = e.target.dataset.personaNome;
            const eventoNome = e.target.dataset.eventoNome;
            
            // Chiedi conferma
            const motivo = prompt(`Annullare l'accredito di ${personaNome} per l'evento "${eventoNome}"?\n\nInserisci il motivo dell'annullamento:`);
            
            if (!motivo) {
                return; // User cancelled
            }
            
            try {
                // Disable button during request
                e.target.disabled = true;
                e.target.textContent = '🔄 Annullando...';
                
                await apiCall('POST', `/redenzioni/${redenzioneId}/annulla`, {
                    motivo: motivo,
                    operatore: currentUser.username
                });
                
                showAlert('Accredito annullato con successo', 'success');
                
                // Reload the list
                loadAnnullabili();
                
            } catch (error) {
                showAlert(`❌ Errore annullamento: ${error.message}`, 'error');
                
                // Re-enable button on error
                e.target.disabled = false;
                e.target.textContent = '❌ Annulla';
            }
        });
    });
}

// Utility functions
function clearForm(formId) {
    document.getElementById(formId).reset();
}

function formatDateTime(dateString) {
    return new Date(dateString).toLocaleString('it-IT');
}


// Handle offline status
window.addEventListener('online', () => {
    showAlert('Connessione ripristinata', 'success');
});

window.addEventListener('offline', () => {
    showAlert('Modalità offline attiva', 'warning');
});

// Modal management
function showModal(modalId) {
    document.getElementById(modalId).classList.add('show');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('show');
    // Clear form
    const form = document.getElementById(modalId).querySelector('form');
    if (form) form.reset();
    // Clear results
    const result = document.getElementById(modalId.replace('Modal', 'Result'));
    if (result) result.innerHTML = '';
}

// Revoca tessera handler
async function handleRevoca(e) {
    e.preventDefault();
    const motivo = document.getElementById('motivoRevoca').value.trim();
    
    if (!motivo) {
        showAlert('Inserisci il motivo della revoca', 'error');
        return;
    }
    
    if (!currentTesseraId || !currentUser) {
        showAlert('Errore: tessera o operatore non identificato', 'error');
        return;
    }
    
    try {
        await apiCall('POST', `/tessere/${currentTesseraId}/revoca`, {
            motivo: motivo,
            operatore: currentUser.username
        });
        
        showAlert('✅ Tessera revocata con successo', 'success');
        closeModal('revocaModal');
        
        // Reload tessera info to show updated status
        await loadTesseraInfo(currentTesseraId);
        
    } catch (error) {
        let errorMsg = error.message;
        if (error.message === 'tessera_non_attiva') {
            errorMsg = 'Tessera già revocata o non attiva';
        }
        showAlert(`❌ Errore revoca: ${errorMsg}`, 'error');
    }
}

// Nuovo tesserino handler
async function handleNuovoTesserino(e) {
    e.preventDefault();
    const expDate = document.getElementById('expDateNuovo').value;
    const resultContainer = document.getElementById('nuovoResult');
    
    if (!currentPersonaId || !currentUser) {
        showAlert('Errore: persona o operatore non identificato', 'error', resultContainer);
        return;
    }
    
    try {
        const payload = {
            persona_id: currentPersonaId,
            operatore: currentUser.username
        };
        
        if (expDate) {
            payload.exp_date = expDate;
        }
        
        const result = await apiCall('POST', '/tessere/nuovo', payload);
        
        const successHtml = `
            <div class="alert-success">
                <h4>✅ Nuovo tesserino creato!</h4>
                <p><strong>ID:</strong> ${result.tesserino.id}</p>
                <p><strong>Scadenza:</strong> ${result.tesserino.exp_date}</p>
                <div class="qr-display">
                    <strong>QR Code:</strong><br>
                    ${result.tesserino.qr_text}
                </div>
                <small>Copia il QR code per stampare il tesserino</small>
                <div style="margin-top: 1rem; text-align: center;">
                    <button type="button" class="btn-success btn-small" onclick="closeModal('nuovoModal')">✅ Chiudi e Continua</button>
                </div>
                <small style="display: block; text-align: center; margin-top: 0.5rem; opacity: 0.7;">Il dialog si chiuderà automaticamente tra 3 secondi</small>
            </div>
        `;
        
        resultContainer.innerHTML = successHtml;
        
        // Chiudi il modal dopo 3 secondi e aggiorna la visualizzazione della tessera
        setTimeout(() => {
            closeModal('nuovoModal');
            // Se c'è una tessera corrente, ricarica le info per mostrare il nuovo tesserino
            if (currentTesseraId) {
                loadTesseraInfo(currentTesseraId);
            }
        }, 3000);
        
    } catch (error) {
        let errorMsg = error.message;
        if (error.message === 'tessera_attiva_presente') {
            errorMsg = 'Persona ha già un tesserino attivo';
        } else if (error.message === 'persona_non_trovata') {
            errorMsg = 'Persona non trovata nel database';
        }
        showAlert(`❌ Errore creazione: ${errorMsg}`, 'error', resultContainer);
    }
}

// Show revoca button in tessera info for active tessere
function showRevocaButton() {
    if (currentTesseraId) {
        return `<button type="button" class="btn-danger btn-small" onclick="showModal('revocaModal')">🚫 Revoca Tesserino</button>`;
    }
    return '';
}

// Setup event listeners for tessera management buttons
function setupTesseraButtons(tessera) {
    const revocaBtn = document.getElementById('revocaTesseraBtn');
    const nuovoBtn  = document.getElementById('nuovoTesseraBtn');

    if (revocaBtn) revocaBtn.addEventListener('click', () => showModal('revocaModal'));

    if (nuovoBtn) {
        currentPersonaId = nuovoBtn.dataset.personaId;
        nuovoBtn.addEventListener('click', () => showModal('nuovoModal'));
    }

    // Stampa buttons (A4 / Tessera) nella card cassa
    document.querySelectorAll('.stampa-singolo-btn').forEach(btn => {
        btn.addEventListener('click', () =>
            handleSinglePrint(btn.dataset.id, btn.dataset.nome.replace(/&quot;/g, '"'), btn.dataset.formato || 'a4'));
    });

    // Accredita buttons — one per non-redeemed event
    document.querySelectorAll('.accredita-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            handleVenditaForEvent(
                btn.dataset.eventoId,
                btn.dataset.eventoNome.replace(/&quot;/g, '"')
            );
        });
    });

    // Omaggio ospite buttons — solo per strumentisti in organico
    document.querySelectorAll('.omaggio-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            handleOmaggio(
                btn.dataset.strumentistaId,
                btn.dataset.eventoId,
                btn.dataset.eventoNome.replace(/&quot;/g, '"')
            );
        });
    });

    // Da terzi buttons — expand inline QR input
    document.querySelectorAll('.da-terzi-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            toggleDaTerziInput(
                btn.dataset.eventoId,
                btn.dataset.eventoNome.replace(/&quot;/g, '"')
            );
        });
    });

    // Filtri eventi
    ['filtroKeyword', 'filtroData', 'filtroOra', 'filtroLocation'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', applyEventiFilter);
    });
}

function applyEventiFilter() {
    const keyword  = (document.getElementById('filtroKeyword')?.value  || '').trim().toLowerCase();
    const data     = (document.getElementById('filtroData')?.value     || '');
    const ora      = (document.getElementById('filtroOra')?.value      || '');
    const location = (document.getElementById('filtroLocation')?.value || '').trim().toLowerCase();

    const filtered = _eventiCompleti.filter(ev => {
        if (keyword  && !ev.nome.toLowerCase().includes(keyword))        return false;
        if (data     && !ev.data.startsWith(data))                       return false;
        if (ora      && !ev.data.includes(ora))                          return false;
        if (location && !(ev.luogo || '').toLowerCase().includes(location)) return false;
        return true;
    });

    const container = document.getElementById('eventiListContainer');
    if (!container) return;
    container.innerHTML = filtered.length > 0
        ? events_html(filtered, _tesseraCorrente.stato, _prezzoLabelCorrente)
        : '<div class="alert alert-info">Nessun evento corrisponde ai filtri.</div>';
    rewireEventiButtons();
}

function rewireEventiButtons() {
    document.querySelectorAll('.accredita-btn').forEach(btn => {
        btn.addEventListener('click', () =>
            handleVenditaForEvent(btn.dataset.eventoId, btn.dataset.eventoNome.replace(/&quot;/g, '"'))
        );
    });
    document.querySelectorAll('.omaggio-btn').forEach(btn => {
        btn.addEventListener('click', () =>
            handleOmaggio(btn.dataset.strumentistaId, btn.dataset.eventoId, btn.dataset.eventoNome.replace(/&quot;/g, '"'))
        );
    });
    document.querySelectorAll('.da-terzi-btn').forEach(btn => {
        btn.addEventListener('click', () =>
            toggleDaTerziInput(btn.dataset.eventoId, btn.dataset.eventoNome.replace(/&quot;/g, '"'))
        );
    });
}

function toggleDaTerziInput(eventoId, eventoNome) {
    const row = document.querySelector(`.da-terzi-btn[data-evento-id="${eventoId}"]`)
                        ?.closest('.evento-item');
    if (!row) return;

    const existing = row.querySelector('.da-terzi-panel');
    if (existing) { existing.remove(); return; }

    const panel = document.createElement('div');
    panel.className = 'da-terzi-panel';
    panel.style.cssText = 'padding:12px 0 4px; border-top:1px solid var(--separator); margin-top:10px; width:100%;';
    panel.innerHTML = `
        <label style="font-size:12px; color:var(--gray); display:block; margin-bottom:6px; text-transform:uppercase; letter-spacing:.05em;">QR del portatore</label>
        <div style="display:flex; gap:8px; align-items:center;">
            <input type="text" class="da-terzi-qr" placeholder="Scansiona QR del portatore..."
                style="flex:1; font-family:monospace; font-size:13px;">
            <button type="button" class="btn-success btn-small confirma-da-terzi">Accredita</button>
            <button type="button" class="btn-small annulla-da-terzi" style="background:var(--ivory-dark);">✕</button>
        </div>
        <div class="da-terzi-result" style="margin-top:8px;"></div>
    `;
    row.style.flexWrap = 'wrap';
    row.appendChild(panel);
    panel.querySelector('.da-terzi-qr').focus();

    panel.querySelector('.annulla-da-terzi').addEventListener('click', () => panel.remove());

    const eseguiAccredito = () => {
        const qr = panel.querySelector('.da-terzi-qr').value.trim();
        if (qr) handleAccreditaDaTerzi(eventoId, eventoNome, qr, panel.querySelector('.da-terzi-result'));
    };
    panel.querySelector('.confirma-da-terzi').addEventListener('click', eseguiAccredito);
    panel.querySelector('.da-terzi-qr').addEventListener('keydown', e => {
        if (e.key === 'Enter') eseguiAccredito();
    });
}

async function handleAccreditaDaTerzi(eventoId, eventoNome, qrPortatore, resultContainer) {
    try {
        const verifica = await apiCall('POST', '/qr/verify', { qr: qrPortatore });
        const portatoreTesseraId = verifica.id;

        const info = await apiCall('GET', `/tessere/${portatoreTesseraId}`);
        const nomePortatore = info.tessera.nome;

        showAlert(`Portatore: ${nomePortatore} · accreditando...`, 'info', resultContainer);

        const result = await apiCall('POST', '/vendite', {
            tesserino_id: currentTesseraId,
            evento_id: eventoId,
            operatore: currentUser.username,
            presentato_da_tesserino_id: portatoreTesseraId
        });

        showAlert(
            `Accreditato per "${eventoNome}" · €${result.prezzo} · portato da ${nomePortatore}`,
            'success',
            document.getElementById('venditaResult')
        );
        await loadTesseraInfo(currentTesseraId);

    } catch (error) {
        if (error.message === 'duplicato' || error.message === 'persona_gia_accreditata') {
            showAlert(`Già accreditata per "${eventoNome}"`, 'info', document.getElementById('venditaResult'));
            await loadTesseraInfo(currentTesseraId);
        } else {
            const msg = error.message === 'portatore_non_trovato' ? 'QR portatore non valido'
                      : error.message === 'portatore_non_attivo'  ? 'tesserino portatore non attivo'
                      : error.message;
            showAlert(`Errore: ${msg}`, 'error', resultContainer);
        }
    }
}

// Show nuovo tesserino button based on persona status
function showNuovoButton(personaId) {
    currentPersonaId = personaId;
    return `<button type="button" class="btn-success btn-small" onclick="showModal('nuovoModal')">➕ Nuovo Tesserino</button>`;
}

// ======================
// NAVIGATION FUNCTIONS
// ======================

// Setup navigation after login
function setupNavigation() {
    const navbar = document.getElementById('navbar');
    const navButtons = document.querySelectorAll('.nav-btn');
    
    navbar.style.display = 'block';
    
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const page = btn.dataset.page;
            showPage(page);
            
            // Update active button
            navButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
    
    // Setup tab navigation
    setupTabs();
    
    // Setup new page event listeners
    setupNewPageListeners();
}

// Show/hide pages
function showPage(pageName) {
    currentPage = pageName;
    
    // Hide all pages
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => page.classList.remove('active'));
    
    // Show main interface or specific page
    if (pageName === 'main') {
        mainInterface.style.display = 'block';
    } else {
        mainInterface.style.display = 'none';
        const targetPage = document.getElementById(`${pageName}Page`);
        if (targetPage) {
            targetPage.classList.add('active');
        }
        
        // Auto-load data when entering specific pages
        if (pageName === 'visualizza') {
            loadTessere();
        }
        if (pageName === 'admin') {
            loadAdminUtenti();
        }
    }
}

// Setup tab functionality
function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            const parent = btn.closest('.card');

            parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            parent.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            parent.querySelector(`#${tabId}`).classList.add('active');

            if (tabId === 'gestione-eventi') loadAdminEventi();
            if (tabId === 'gestione-tariffe') loadAdminTariffe();
            if (tabId === 'gestione-persone') loadAdminPersone();
            if (tabId === 'gestione-organico') loadOrganico();
            if (tabId === 'analytics-vendite') loadVenditeReport();
            if (tabId === 'analytics-log') loadLog();
        });
    });
}

// ======================
// VISUALIZZA TESSERE
// ======================

// Load all tessere
async function loadTessere(search = '') {
    const resultContainer = document.getElementById('tessereResult');
    
    try {
        const params = new URLSearchParams({
            search: search,
            sortBy: currentSort.field,
            sortOrder: currentSort.order
        });
        
        const result = await apiCall('GET', `/tessere/all?${params}`);
        tessereData = result.tessere;
        
        if (tessereData.length === 0) {
            showAlert('Nessun tesserino trovato', 'info', resultContainer);
            return;
        }
        
        // Reset selection state
        selectedTessere.clear();
        
        const validTessereCount = tessereData.filter(t => t.stato === 'attivo').length;
        const printButtonHtml = validTessereCount > 0 ? `
            <div class="print-controls">
                <h4>Stampa Tesserini <span id="selectionCounter" style="font-weight:400; font-size:12px; margin-left:8px;">0 selezionati</span></h4>
                <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                    <button id="stampaA4Btn" class="btn-success btn-small" disabled>A4 (8/pag)</button>
                    <button id="stampaTesseraBtn" class="btn-secondary btn-small" disabled>Tessera singola</button>
                    <span style="color:var(--gray); font-size:12px; margin:0 4px;">·</span>
                    <button id="selectAllBtn" class="btn-secondary btn-small">Seleziona Tutti</button>
                    <button id="deselectAllBtn" class="btn-secondary btn-small">Deseleziona Tutti</button>
                </div>
                <div id="stampaProgress">Generazione PDF in corso...</div>
            </div>
        ` : '';
        
        const tableHtml = `
            ${printButtonHtml}
            <table class="table">
                <thead>
                    <tr>
                        ${validTessereCount > 0 ? '<th style="width: 40px;">Seleziona</th>' : ''}
                        <th data-sort="nome">Nome <span class="sort-indicator">${getSortIndicator('nome')}</span></th>
                        <th data-sort="stato">Stato <span class="sort-indicator">${getSortIndicator('stato')}</span></th>
                        <th data-sort="exp_date">Scadenza <span class="sort-indicator">${getSortIndicator('exp_date')}</span></th>
                        <th data-sort="created_at">Creato <span class="sort-indicator">${getSortIndicator('created_at')}</span></th>
                        <th>ID Tesserino</th>
                        <th>Azioni</th>
                    </tr>
                </thead>
                <tbody>
                    ${tessereData.map(t => `
                        <tr data-tesserino-id="${t.id}">
                            ${validTessereCount > 0 ? `<td>
                                ${t.stato === 'attivo' ? 
                                    `<input type="checkbox" class="tessera-checkbox" data-id="${t.id}" style="width: auto; margin: 0;">` : 
                                    '<span style="color: #ccc;">—</span>'
                                }
                            </td>` : ''}
                            <td>
                                <strong>${t.nome}</strong><br>
                                <small style="color: #666;">${t.categoria}</small>
                            </td>
                            <td>
                                <span class="status-badge ${t.stato === 'attivo' ? 'status-success' : 'status-error'}">
                                    ${t.stato}
                                </span>
                            </td>
                            <td>${new Date(t.exp_date).toLocaleDateString('it-IT')}</td>
                            <td>${new Date(t.created_at).toLocaleDateString('it-IT')}</td>
                            <td>
                                <code style="font-size: 0.8rem;">${t.id.substring(0, 8)}...</code>
                            </td>
                            <td>
                                <div style="display:flex; gap:4px; flex-wrap:wrap;">
                                    <button class="btn-small btn-secondary modifica-tessera-btn"
                                        data-persona-id="${t.persona_id}"
                                        data-nome="${t.nome.replace(/"/g, '&quot;')}"
                                        data-categoria="${t.categoria}">Modifica</button>
                                    <button class="btn-small btn-secondary copy-qr-btn" data-qr="${t.qr_text.replace(/"/g, '&quot;')}">Copia QR</button>
                                    ${t.stato === 'attivo' ? `
                                        <button class="btn-small stampa-singolo-btn" data-id="${t.id}" data-nome="${t.nome.replace(/"/g, '&quot;')}" data-formato="a4">A4</button>
                                        <button class="btn-small btn-secondary stampa-singolo-btn" data-id="${t.id}" data-nome="${t.nome.replace(/"/g, '&quot;')}" data-formato="tessera">Tessera</button>
                                    ` : ''}
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        
        resultContainer.innerHTML = tableHtml;
        
        // Add event listeners for all functionality
        setupTableEventListeners();
        setupPrintFunctionality();
        
    } catch (error) {
        showAlert(`Errore caricamento tessere: ${error.message}`, 'error', resultContainer);
    }
}

// Sort tessere
function sortTessere(field) {
    if (currentSort.field === field) {
        currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.field = field;
        currentSort.order = 'desc';
    }
    
    const search = document.getElementById('searchTessere').value;
    loadTessere(search);
}

// Get sort indicator
function getSortIndicator(field) {
    if (currentSort.field === field) {
        return currentSort.order === 'asc' ? '↑' : '↓';
    }
    return '';
}

// Copy QR code
function copyQR(qrText) {
    navigator.clipboard.writeText(qrText).then(() => {
        showAlert('QR code copiato negli appunti!', 'success');
    }).catch(err => {
        console.error('Errore copia QR:', err);
        showAlert('Errore durante la copia', 'error');
    });
}

// Setup table event listeners
function setupTableEventListeners() {
    const resultContainer = document.getElementById('tessereResult');
    
    // Sort headers
    const sortHeaders = resultContainer.querySelectorAll('th[data-sort]');
    sortHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const field = header.dataset.sort;
            sortTessere(field);
        });
    });
    
    // Modifica tessera buttons
    resultContainer.querySelectorAll('.modifica-tessera-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            openModificaTesseraModal(
                btn.dataset.personaId,
                btn.dataset.nome.replace(/&quot;/g, '"'),
                btn.dataset.categoria
            );
        });
    });

    // Copy QR buttons
    const copyButtons = resultContainer.querySelectorAll('.copy-qr-btn');
    copyButtons.forEach(button => {
        button.addEventListener('click', () => {
            const qrText = button.dataset.qr.replace(/&quot;/g, '"');
            copyQR(qrText);
        });
    });
}

// ======================
// CREA TESSERINO
// ======================

// Search persone with advanced filters
async function searchPersoneWithFilters() {
    const resultContainer = document.getElementById('personeList');
    
    // Get filter values
    const filters = {
        search: document.getElementById('filtroNome').value.trim(),
        id: document.getElementById('filtroId').value.trim(),
        categoria: document.getElementById('filtroCategoria').value,
        data_nascita: document.getElementById('filtroDataNascita').value,
        residente_urbino: document.getElementById('filtroResidenzeUrbino').value,
        doc_verificato: document.getElementById('filtroDocVerificato').value
    };
    
    // Build query string
    const queryParams = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
        if (value) {
            queryParams.append(key, value);
        }
    });
    
    try {
        const result = await apiCall('GET', `/persone?${queryParams.toString()}`);
        const persone = result.persone;
        
        if (persone.length === 0) {
            resultContainer.innerHTML = '<div class="alert-info"><p style="text-align: center; margin: 0;">😔 Nessuna persona trovata con i filtri specificati</p></div>';
            return;
        }
        
        displayPersoneList(persone, resultContainer);
        
    } catch (error) {
        showAlert(`Errore ricerca persone: ${error.message}`, 'error', resultContainer);
    }
}

// Load all persone without filters
async function loadAllPersone() {
    const resultContainer = document.getElementById('personeList');
    
    try {
        const result = await apiCall('GET', '/persone');
        const persone = result.persone;
        
        if (persone.length === 0) {
            resultContainer.innerHTML = '<div class="alert-info"><p style="text-align: center; margin: 0;">📝 Nessuna persona nel database</p></div>';
            return;
        }
        
        displayPersoneList(persone, resultContainer);
        
    } catch (error) {
        showAlert(`Errore caricamento persone: ${error.message}`, 'error', resultContainer);
    }
}

// Display persone list with checkboxes for multi-select creation
function displayPersoneList(persone, container) {
    const senzaTessera = persone.filter(p => !p.tesserino_id);

    container.innerHTML = `
        <!-- Batch action bar -->
        <div id="batchActionBar" style="display:none; background:var(--black); color:var(--ivory); padding:12px 16px; align-items:center; justify-content:space-between; gap:12px; position:sticky; top:0; z-index:10;">
            <span id="batchCount" style="font-size:12px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase;"></span>
            <div style="display:flex; gap:8px;">
                <button type="button" id="deselezionaTuttiBtn" class="btn-secondary btn-small">Deseleziona</button>
                <button type="button" id="creaBatchBtn" class="btn-success btn-small">Crea tesserini</button>
            </div>
        </div>

        <!-- Header con select-all -->
        <div style="background:var(--black); color:var(--ivory); padding:12px 16px; display:flex; align-items:center; gap:12px;">
            <input type="checkbox" id="selectAllPersone"
                style="width:16px; height:16px; cursor:pointer; flex-shrink:0; accent-color:var(--red);"
                ${senzaTessera.length === 0 ? 'disabled' : ''}>
            <label for="selectAllPersone" style="font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:var(--ivory); margin:0; cursor:pointer;">
                Seleziona tutti — ${persone.length} persone (${senzaTessera.length} senza tessera)
            </label>
        </div>

        <!-- Lista -->
        <div style="max-height:520px; overflow-y:auto;">
            ${persone.map(p => {
                const hasTesserino = !!p.tesserino_id;
                return `
                    <div class="evento-item" style="margin-bottom:0; gap:12px; opacity:${hasTesserino ? '0.65' : '1'};">
                        <div style="width:20px; flex-shrink:0; display:flex; align-items:center;">
                            ${!hasTesserino
                                ? `<input type="checkbox" class="persona-checkbox"
                                    data-id="${p.id}"
                                    data-nome="${p.nome.replace(/"/g, '&quot;')}"
                                    style="width:16px; height:16px; cursor:pointer; accent-color:var(--red);">`
                                : `<span style="width:16px; height:16px; display:inline-block;"></span>`
                            }
                        </div>
                        <div style="flex:1; min-width:0;">
                            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:3px;">
                                <strong>${p.nome}</strong>
                                <button class="status-badge doc-toggle-crea-btn ${p.doc_verificato ? 'status-success' : 'status-warning'}"
                                    style="cursor:pointer; border:none; font-size:11px;"
                                    data-id="${p.id}" data-doc="${p.doc_verificato}">
                                    ${p.doc_verificato ? 'Doc OK' : 'Doc ?'}
                                </button>
                                ${hasTesserino ? `<span class="status-badge status-success">Tessera attiva — scad. ${p.tesserino_scadenza}</span>` : ''}
                            </div>
                            <small style="color:var(--gray);">${p.categoria}${p.residente_urbino ? ' · Urbino' : ''}${p.data_nascita ? ' · ' + p.data_nascita : ''}</small>
                        </div>
                        <div style="flex-shrink:0;">
                            ${hasTesserino
                                ? `<button type="button" class="btn-secondary btn-small copy-qr-person-btn" data-qr="${p.tesserino_qr}">Copia QR</button>`
                                : `<button type="button" class="btn-success btn-small create-tesserino-person-btn"
                                    data-persona-id="${p.id}" data-persona-nome="${p.nome.replace(/"/g, '&quot;')}">Crea</button>`
                            }
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
        <div id="batchResult" style="padding:0;"></div>
    `;

    setupPersoneListEventListeners(container);
}

// Setup event listeners for person list buttons
function setupPersoneListEventListeners(container) {
    // Copy QR — single
    container.querySelectorAll('.copy-qr-person-btn').forEach(btn => {
        btn.addEventListener('click', e => { e.preventDefault(); copyTesserinoQR(btn.dataset.qr); });
    });

    // Create tessera — single
    container.querySelectorAll('.create-tesserino-person-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            e.preventDefault();
            createTesserinoForPerson(btn.dataset.personaId, btn.dataset.personaNome.replace(/&quot;/g, '"'));
        });
    });

    // Doc toggle — in Crea list
    container.querySelectorAll('.doc-toggle-crea-btn').forEach(btn => {
        btn.addEventListener('click', async e => {
            e.preventDefault();
            const nuovoStato = btn.dataset.doc !== 'true';
            btn.disabled = true;
            try {
                await apiCall('PATCH', `/persone/${btn.dataset.id}`, { doc_verificato: nuovoStato });
                btn.dataset.doc = String(nuovoStato);
                btn.textContent = nuovoStato ? 'Doc OK' : 'Doc ?';
                btn.className = `status-badge doc-toggle-crea-btn ${nuovoStato ? 'status-success' : 'status-warning'}`;
                btn.style.cssText = 'cursor:pointer; border:none; font-size:11px;';
            } catch (error) {
                showAlert(`Errore: ${error.message}`, 'error');
            }
            btn.disabled = false;
        });
    });

    // Checkbox multi-select logic
    const checkboxes  = container.querySelectorAll('.persona-checkbox');
    const selectAll   = container.querySelector('#selectAllPersone');
    const batchBar    = container.querySelector('#batchActionBar');
    const batchCount  = container.querySelector('#batchCount');
    const creaBatchBtn = container.querySelector('#creaBatchBtn');
    const deselBtn    = container.querySelector('#deselezionaTuttiBtn');

    function updateBatchBar() {
        const n = container.querySelectorAll('.persona-checkbox:checked').length;
        if (n > 0) {
            batchBar.style.display = 'flex';
            batchCount.textContent = `${n} selezionat${n === 1 ? 'o' : 'i'}`;
        } else {
            batchBar.style.display = 'none';
        }
        if (selectAll) {
            const all = container.querySelectorAll('.persona-checkbox').length;
            selectAll.indeterminate = n > 0 && n < all;
            selectAll.checked = all > 0 && n === all;
        }
    }

    checkboxes.forEach(cb => cb.addEventListener('change', updateBatchBar));

    if (selectAll) {
        selectAll.addEventListener('change', () => {
            checkboxes.forEach(cb => { cb.checked = selectAll.checked; });
            updateBatchBar();
        });
    }

    if (deselBtn) deselBtn.addEventListener('click', () => {
        checkboxes.forEach(cb => { cb.checked = false; });
        if (selectAll) selectAll.checked = false;
        updateBatchBar();
    });

    if (creaBatchBtn) creaBatchBtn.addEventListener('click', () => handleCreaBatch(container));
}

// Copy tesserino QR code
function copyTesserinoQR(qrText) {
    navigator.clipboard.writeText(qrText).then(() => {
        showAlert('QR code copiato negli appunti! 📋', 'success');
    }).catch(err => {
        console.error('Errore copia QR:', err);
        showAlert('Errore durante la copia del QR', 'error');
    });
}

// Create tesserino for person with modal
async function createTesserinoForPerson(personaId, nomePersona) {
    try {
        const payload = {
            persona_id: personaId,
            operatore: currentUser.username
        };
        
        const result = await apiCall('POST', '/tessere/nuovo', payload);
        
        // Show success modal with tesserino details
        showTesserinoCreatedModal({
            persona: nomePersona,
            tesserino: result.tesserino
        });
        
        // Refresh the person list to show updated status
        searchPersoneWithFilters();
        
    } catch (error) {
        let errorMsg = error.message;
        if (error.message === 'tessera_attiva_presente') {
            errorMsg = 'Persona ha già un tesserino attivo';
        }
        showAlert(`❌ Errore creazione tesserino: ${errorMsg}`, 'error');
    }
}

// Batch creation for multiple selected personas
async function handleCreaBatch(container) {
    const checked = [...container.querySelectorAll('.persona-checkbox:checked')];
    if (checked.length === 0) return;

    const creaBatchBtn = container.querySelector('#creaBatchBtn');
    const batchResult  = container.querySelector('#batchResult');
    creaBatchBtn.disabled = true;
    creaBatchBtn.textContent = `Creazione 0/${checked.length}...`;

    const ok = [];
    const errori = [];

    for (let i = 0; i < checked.length; i++) {
        const cb   = checked[i];
        const id   = cb.dataset.id;
        const nome = cb.dataset.nome.replace(/&quot;/g, '"');
        creaBatchBtn.textContent = `Creazione ${i + 1}/${checked.length}...`;
        try {
            await apiCall('POST', '/tessere/nuovo', {
                persona_id: id,
                operatore: currentUser.username
            });
            ok.push(nome);
        } catch (error) {
            const msg = error.message === 'tessera_attiva_presente' ? 'tessera già attiva' : error.message;
            errori.push(`${nome} (${msg})`);
        }
    }

    creaBatchBtn.disabled = false;
    creaBatchBtn.textContent = 'Crea tesserini';

    batchResult.innerHTML = `
        <div style="padding:16px 0 0;">
            ${ok.length > 0 ? `<div class="alert alert-success">${ok.length} tesserino${ok.length > 1 ? 'i creati' : ' creato'}: ${ok.join(', ')}</div>` : ''}
            ${errori.length > 0 ? `<div class="alert alert-error">${errori.length} errore${errori.length > 1 ? 'i' : ''}: ${errori.join(' — ')}</div>` : ''}
        </div>
    `;

    setTimeout(searchPersoneWithFilters, 1200);
}

// Show tesserino created modal
function showTesserinoCreatedModal(data) {
    const modal = document.getElementById('riepilogoTesserinoModal');
    const content = document.getElementById('riepilogoTesserinoContent');
    
    content.innerHTML = `
        <div class="alert-success" style="margin: 0;">
            <h4 style="margin-bottom: 1rem; color: #155724;">✅ Tesserino creato con successo!</h4>
            
            <div style="background: white; padding: 1rem; border-radius: 8px; margin: 1rem 0;">
                <p><strong>👤 Persona:</strong> ${data.persona}</p>
                <p><strong>🆔 ID Tesserino:</strong> ${data.tesserino.id}</p>
                <p><strong>📅 Scadenza:</strong> ${data.tesserino.exp_date}</p>
                <p><strong>📱 Stato:</strong> <span class="status-badge status-success">Attivo</span></p>
            </div>
            
            <div class="qr-display">
                <strong>🔐 QR Code:</strong><br>
                <div style="font-family: monospace; font-size: 0.875rem; word-break: break-all; margin-top: 0.5rem;">
                    ${data.tesserino.qr_text}
                </div>
            </div>
        </div>
    `;
    
    // Store QR text for copy button
    modal.dataset.qrText = data.tesserino.qr_text;
    
    modal.classList.add('show');
}

// Clear all filters
function clearAllFilters() {
    document.getElementById('filtroNome').value = '';
    document.getElementById('filtroId').value = '';
    document.getElementById('filtroCategoria').value = '';
    document.getElementById('filtroDataNascita').value = '';
    document.getElementById('filtroResidenza').value = '';
    document.getElementById('filtroDocVerificato').value = '';
    
    // Clear results
    document.getElementById('personeList').innerHTML = '';
}

// Select persona for tessera creation
async function selectPersona(personaId, nomePersona) {
    try {
        // Check if persona already has active tessera
        const result = await apiCall('GET', `/persone/${personaId}`);
        
        if (result.tessera_attiva) {
            showAlert(`${nomePersona} ha già un tesserino attivo (ID: ${result.tessera_attiva.id.substring(0, 8)}..., scadenza: ${result.tessera_attiva.exp_date})`, 'error', document.getElementById('creaTesserinoResult'));
            return;
        }
        
        // Show tessera creation form
        document.getElementById('selectedPersonId').value = personaId;
        document.getElementById('selectedPersonName').textContent = nomePersona;
        document.getElementById('creaTesserinoForm').style.display = 'block';
        document.getElementById('personeList').innerHTML = '';
        document.getElementById('searchPersone').value = '';
        
        // Set default expiry date
        const nextYear = new Date();
        nextYear.setFullYear(nextYear.getFullYear() + 1);
        document.getElementById('expDateCrea').value = nextYear.toISOString().slice(0, 10);
        
    } catch (error) {
        showAlert(`Errore verifica persona: ${error.message}`, 'error', document.getElementById('creaTesserinoResult'));
    }
}

// Handle tessera creation for existing persona
async function handleCreaTesserino(e) {
    e.preventDefault();
    const personaId = document.getElementById('selectedPersonId').value;
    const expDate = document.getElementById('expDateCrea').value;
    const resultContainer = document.getElementById('creaTesserinoResult');
    
    try {
        const payload = {
            persona_id: personaId,
            operatore: currentUser.username
        };
        
        if (expDate) {
            payload.exp_date = expDate;
        }
        
        const result = await apiCall('POST', '/tessere/nuovo', payload);
        
        const successHtml = `
            <div class="alert-success">
                <h4>✅ Tesserino creato con successo!</h4>
                <p><strong>ID:</strong> ${result.tesserino.id}</p>
                <p><strong>Scadenza:</strong> ${result.tesserino.exp_date}</p>
                <div class="qr-display">
                    <strong>QR Code:</strong><br>
                    ${result.tesserino.qr_text}
                    <button class="btn-small btn-secondary" onclick="copyQR('${result.tesserino.qr_text}')">📋 Copia</button>
                </div>
            </div>
        `;
        
        resultContainer.innerHTML = successHtml;
        document.getElementById('creaTesserinoForm').style.display = 'none';
        
    } catch (error) {
        let errorMsg = error.message;
        if (error.message === 'tessera_attiva_presente') {
            errorMsg = 'Persona ha già un tesserino attivo';
        }
        showAlert(`❌ Errore: ${errorMsg}`, 'error', resultContainer);
    }
}

// Handle new persona + tessera creation
async function handleNuovaPersonaTesserino(e) {
    e.preventDefault();
    const resultContainer = document.getElementById('nuovaPersonaResult');
    
    const personaData = {
        nome: document.getElementById('nomePersona').value.trim(),
        categoria: document.getElementById('categoriaPersona').value,
        data_nascita: document.getElementById('dataNascitaPersona').value || null,
        residente_urbino: document.getElementById('residenteUrbinoPersona').checked,
        doc_verificato: document.getElementById('docVerificatoPersona').checked
    };
    
    const expDate = document.getElementById('expDateNuovaPersona').value;
    
    try {
        // Create persona first
        const personaResult = await apiCall('POST', '/persone', personaData);
        const personaId = personaResult.persona.id;
        
        // Create tessera
        const tesserinoPayload = {
            persona_id: personaId,
            operatore: currentUser.username
        };
        
        if (expDate) {
            tesserinoPayload.exp_date = expDate;
        }
        
        const tesserinoResult = await apiCall('POST', '/tessere/nuovo', tesserinoPayload);
        
        const successHtml = `
            <div class="alert-success">
                <h4>✅ Persona e tesserino creati con successo!</h4>
                <p><strong>Persona:</strong> ${personaResult.persona.nome} (${personaResult.persona.categoria})</p>
                <p><strong>ID Tesserino:</strong> ${tesserinoResult.tesserino.id}</p>
                <p><strong>Scadenza:</strong> ${tesserinoResult.tesserino.exp_date}</p>
                <div class="qr-display">
                    <strong>QR Code:</strong><br>
                    ${tesserinoResult.tesserino.qr_text}
                    <button class="btn-small btn-secondary" onclick="copyQR('${tesserinoResult.tesserino.qr_text}')">📋 Copia</button>
                </div>
            </div>
        `;
        
        resultContainer.innerHTML = successHtml;
        document.getElementById('nuovaPersonaForm').reset();
        
    } catch (error) {
        showAlert(`❌ Errore: ${error.message}`, 'error', resultContainer);
    }
}

// ======================
// IMPORT CSV
// ======================

// Handle CSV import
async function handleImportCSV(formId, endpoint, fileInputId) {
    const form = document.getElementById(formId);
    const fileInput = document.getElementById(fileInputId);
    const resultContainer = document.getElementById(formId.replace('Form', 'Result'));
    
    if (!fileInput.files.length) {
        showAlert('Seleziona un file CSV', 'error', resultContainer);
        return;
    }
    
    const formData = new FormData();
    formData.append('csv', fileInput.files[0]);

    try {
        const response = await fetch(API_BASE + endpoint, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` },
            body: formData
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Errore durante l\'import');
        }
        
        let message = `✅ Import completato: ${result.importate || result.importati} record importati`;

        if (result.avvisi && result.avvisi.length > 0) {
            message += `\n\n⚠️ Avvisi (${result.avvisi.length}):\n${result.avvisi.slice(0, 5).join('\n')}`;
            if (result.avvisi.length > 5) message += `\n... e altri ${result.avvisi.length - 5} avvisi`;
        }

        if (result.errori && result.errori.length > 0) {
            message += `\n\n❌ Errori (${result.errori.length}):\n${result.errori.slice(0, 5).join('\n')}`;
            if (result.errori.length > 5) message += `\n... e altri ${result.errori.length - 5} errori`;
        }

        const level = result.errori?.length ? 'error' : result.avvisi?.length ? 'info' : 'success';
        showAlert(message, level, resultContainer);
        form.reset();
        
        // Reload eventi if this was an events import
        if (endpoint === '/import/eventi') {
            loadEventi();
        }
        
    } catch (error) {
        showAlert(`❌ Errore import: ${error.message}`, 'error', resultContainer);
    }
}

// Setup event listeners for new pages
function setupNewPageListeners() {
    // Setup modal close buttons
    document.addEventListener('click', (e) => {
        if (e.target.hasAttribute('data-close-modal')) {
            const modalId = e.target.getAttribute('data-close-modal');
            closeModal(modalId);
        }
    });
    
    // Visualizza tessere
    document.getElementById('loadTessereBtn').addEventListener('click', () => loadTessere());
    document.getElementById('searchTessere').addEventListener('input', (e) => {
        const search = e.target.value;
        loadTessere(search);
    });
    document.getElementById('clearSearchTessere').addEventListener('click', () => {
        document.getElementById('searchTessere').value = '';
        loadTessere();
    });
    
    // Crea tesserino - new filtering system
    document.getElementById('filtriPersoneForm').addEventListener('submit', (e) => {
        e.preventDefault();
        searchPersoneWithFilters();
    });
    
    document.getElementById('clearFiltriBtn').addEventListener('click', (e) => {
        e.preventDefault();
        clearAllFilters();
    });
    
    document.getElementById('loadAllPersoneBtn').addEventListener('click', (e) => {
        e.preventDefault();
        loadAllPersone();
    });
    
    // Modal QR copy button
    document.getElementById('copyQRFromModal').addEventListener('click', () => {
        const modal = document.getElementById('riepilogoTesserinoModal');
        const qrText = modal.dataset.qrText;
        if (qrText) {
            copyTesserinoQR(qrText);
        }
    });
    
    document.getElementById('creaTesserinoForm').addEventListener('submit', handleCreaTesserino);
    document.getElementById('annullaPersona').addEventListener('click', () => {
        document.getElementById('creaTesserinoForm').style.display = 'none';
        document.getElementById('personeList').innerHTML = '';
        clearAllFilters();
    });
    document.getElementById('nuovaPersonaForm').addEventListener('submit', handleNuovaPersonaTesserino);
    
    // Import CSV
    document.getElementById('importPersoneForm').addEventListener('submit', (e) => {
        e.preventDefault();
        handleImportCSV('importPersoneForm', '/import/persone', 'filePersone');
    });
    document.getElementById('importTesseriniForm').addEventListener('submit', (e) => {
        e.preventDefault();
        handleImportCSV('importTesseriniForm', '/import/tesserini', 'fileTesserini');
    });
    document.getElementById('importEventiForm').addEventListener('submit', (e) => {
        e.preventDefault();
        handleImportCSV('importEventiForm', '/import/eventi', 'fileEventi');
    });
    
    // Logout
    document.getElementById('logoutBtn').addEventListener('click', logout);

    // Admin panel — utenti
    document.getElementById('loadUtentiBtn').addEventListener('click', loadAdminUtenti);
    document.getElementById('creaUtenteForm').addEventListener('submit', handleCreaUtente);

    // Admin panel — eventi
    document.getElementById('loadEventiAdminBtn').addEventListener('click', loadAdminEventi);
    document.getElementById('nuovoEventoBtn').addEventListener('click', () => openEventoModal(null));
    document.getElementById('eventoForm').addEventListener('submit', handleSalvaEvento);
    document.getElementById('salvaPrezziSpecialiBtn').addEventListener('click', handleSalvaPrezziSpeciali);

    // Admin panel — tariffe
    document.getElementById('loadTariffeAdminBtn').addEventListener('click', loadAdminTariffe);
    document.getElementById('nuovaTariffaForm').addEventListener('submit', handleNuovaTariffa);
    document.getElementById('tariffaForm').addEventListener('submit', handleSalvaTariffa);

    // Modifica tessera
    document.getElementById('modificaTesseraForm').addEventListener('submit', handleSalvaModificaTessera);

    // Admin panel — persone
    const adminPersoneSearch = document.getElementById('adminPersoneSearch');
    document.getElementById('loadPersoneAdminBtn').addEventListener('click', () => loadAdminPersone(adminPersoneSearch.value));
    adminPersoneSearch.addEventListener('keydown', e => { if (e.key === 'Enter') loadAdminPersone(adminPersoneSearch.value); });

    // Set default dates
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    const defaultDate = nextYear.toISOString().slice(0, 10);

    document.getElementById('expDateCrea').value = defaultDate;
    document.getElementById('expDateNuovaPersona').value = defaultDate;
}

// ======================
// PRINT FUNCTIONALITY
// ======================

// Setup print functionality for tessere table
function setupPrintFunctionality() {
    const stampaA4Btn      = document.getElementById('stampaA4Btn');
    const stampaTesseraBtn = document.getElementById('stampaTesseraBtn');
    const selectAllBtn     = document.getElementById('selectAllBtn');
    const deselectAllBtn   = document.getElementById('deselectAllBtn');
    const checkboxes       = document.querySelectorAll('.tessera-checkbox');
    const stampaButtons    = document.querySelectorAll('.stampa-singolo-btn');

    if (!stampaA4Btn) return;

    checkboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            if (cb.checked) selectedTessere.add(cb.dataset.id);
            else            selectedTessere.delete(cb.dataset.id);
            updateSelectionUI();
        });
    });

    stampaA4Btn.addEventListener('click',      () => handleBatchPrint('a4'));
    stampaTesseraBtn.addEventListener('click', () => handleBatchPrint('tessera'));

    selectAllBtn.addEventListener('click', () => {
        checkboxes.forEach(cb => { cb.checked = true; selectedTessere.add(cb.dataset.id); });
        updateSelectionUI();
    });
    deselectAllBtn.addEventListener('click', () => {
        checkboxes.forEach(cb => { cb.checked = false; selectedTessere.delete(cb.dataset.id); });
        updateSelectionUI();
    });

    stampaButtons.forEach(btn => {
        btn.addEventListener('click', () =>
            handleSinglePrint(btn.dataset.id, btn.dataset.nome, btn.dataset.formato || 'a4'));
    });
}

// Update selection UI counters and button states
function updateSelectionUI() {
    const counter      = document.getElementById('selectionCounter');
    const a4Btn        = document.getElementById('stampaA4Btn');
    const tesseraBtn   = document.getElementById('stampaTesseraBtn');
    if (!counter) return;

    const count = selectedTessere.size;
    counter.textContent = `${count} selezionati`;
    if (a4Btn)      { a4Btn.disabled      = count === 0; a4Btn.textContent      = count > 0 ? `A4 (${count})` : 'A4 (8/pag)'; }
    if (tesseraBtn) { tesseraBtn.disabled = count === 0; tesseraBtn.textContent = count > 0 ? `Tessera (${count})` : 'Tessera singola'; }
}

// Handle batch printing
async function handleBatchPrint(formato = 'a4') {
    if (isStampaInProgress) {
        showAlert('Stampa già in corso, attendere...', 'warning');
        return;
    }
    
    if (selectedTessere.size === 0) {
        showAlert('Seleziona almeno un tesserino da stampare', 'warning');
        return;
    }
    
    const ids = Array.from(selectedTessere);

    try {
        isStampaInProgress = true;
        showPrintProgress(true);

        const response = await fetch(API_BASE + '/tessere/stampa', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ ids, formato })
        });
        if (!response.ok) throw new Error((await response.json()).error || 'Errore PDF');

        downloadBlob(await response.blob(),
            `badge_${ids.length}_${formato}_${new Date().toISOString().slice(0,10)}.pdf`);
        showAlert(`PDF generato: ${ids.length} tesserini (${formato}).`, 'success');

        selectedTessere.clear();
        document.querySelectorAll('.tessera-checkbox:checked').forEach(cb => cb.checked = false);
        updateSelectionUI();
    } catch (error) {
        showAlert(`Errore stampa: ${error.message}`, 'error');
    } finally {
        isStampaInProgress = false;
        showPrintProgress(false);
    }
}

// Handle single tesserino print
async function handleSinglePrint(tesseraId, nomePersona, formato = 'a4') {
    if (isStampaInProgress) { showAlert('Stampa già in corso', 'warning'); return; }

    const btn = document.querySelector(`.stampa-singolo-btn[data-id="${tesseraId}"][data-formato="${formato}"]`);
    const origText = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = '…'; }

    try {
        isStampaInProgress = true;

        const response = await fetch(API_BASE + `/tessere/${tesseraId}/stampa`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ formato })
        });
        if (!response.ok) throw new Error((await response.json()).error || 'Errore PDF');

        downloadBlob(await response.blob(), `badge_${nomePersona.replace(/\s+/g, '_')}_${formato}.pdf`);
        showAlert(`PDF ${formato} generato per ${nomePersona}.`, 'success');
    } catch (error) {
        showAlert(`Errore stampa: ${error.message}`, 'error');
    } finally {
        isStampaInProgress = false;
        if (btn) { btn.disabled = false; btn.textContent = origText; }
    }
}

// Show/hide print progress indicator
function showPrintProgress(show) {
    const progressDiv = document.getElementById('stampaProgress');
    if (!progressDiv) return;

    progressDiv.style.display = show ? 'block' : 'none';
}

// ======================
// ADMIN PANEL
// ======================

async function loadAdminUtenti() {
    const resultContainer = document.getElementById('utentiResult');
    if (!resultContainer) return;

    try {
        const result = await apiCall('GET', '/admin/utenti');
        const utenti = result.utenti;

        if (utenti.length === 0) {
            resultContainer.innerHTML = '<div class="alert alert-info">Nessun utente cassa creato.</div>';
            return;
        }

        resultContainer.innerHTML = `
            <table class="table">
                <thead>
                    <tr>
                        <th>Username</th>
                        <th>Stato</th>
                        <th>Creato il</th>
                        <th>Azioni</th>
                    </tr>
                </thead>
                <tbody>
                    ${utenti.map(u => `
                        <tr>
                            <td><strong>${u.username}</strong></td>
                            <td>
                                <span class="status-badge ${u.attivo ? 'status-success' : 'status-error'}">
                                    ${u.attivo ? 'Attivo' : 'Disabilitato'}
                                </span>
                            </td>
                            <td>${new Date(u.created_at).toLocaleString('it-IT')}</td>
                            <td>
                                <button class="btn-small ${u.attivo ? 'btn-warning' : 'btn-success'} toggle-utente-btn"
                                        data-id="${u.id}">
                                    ${u.attivo ? '🔒 Disabilita' : '🔓 Abilita'}
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        resultContainer.querySelectorAll('.toggle-utente-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                btn.disabled = true;
                try {
                    await apiCall('PATCH', `/admin/utenti/${btn.dataset.id}/attivo`, {});
                    loadAdminUtenti();
                } catch (error) {
                    showAlert(`Errore: ${error.message}`, 'error', resultContainer);
                    btn.disabled = false;
                }
            });
        });

    } catch (error) {
        showAlert(`Errore caricamento utenti: ${error.message}`, 'error', resultContainer);
    }
}

async function handleCreaUtente(e) {
    e.preventDefault();
    const username = document.getElementById('nuovoUsername').value.trim();
    const password = document.getElementById('nuovaPassword').value;
    const resultContainer = document.getElementById('creaUtenteResult');

    try {
        await apiCall('POST', '/admin/utenti', { username, password });
        showAlert(`Utente "${username}" creato con successo`, 'success', resultContainer);
        document.getElementById('creaUtenteForm').reset();
    } catch (error) {
        const msg = error.message === 'username_esistente'
            ? `Username "${username}" già in uso`
            : error.message;
        showAlert(msg, 'error', resultContainer);
    }
}

// ======================
// ADMIN — EVENTI
// ======================

async function loadAdminEventi() {
    const container = document.getElementById('eventiAdminResult');
    if (!container) return;

    try {
        const result = await apiCall('GET', '/eventi');
        const eventiList = result.eventi;

        if (eventiList.length === 0) {
            container.innerHTML = '<div class="alert alert-info">Nessun evento. Usa "+ Nuovo Evento" per aggiungerne uno.</div>';
            return;
        }

        container.innerHTML = `
            <table class="table">
                <thead>
                    <tr>
                        <th>Nome</th>
                        <th>Data</th>
                        <th>Luogo</th>
                        <th>Prezzo base</th>
                        <th>Azioni</th>
                    </tr>
                </thead>
                <tbody>
                    ${eventiList.map(ev => `
                        <tr>
                            <td><strong>${ev.nome}</strong></td>
                            <td>${ev.data}</td>
                            <td>${ev.luogo || '—'}</td>
                            <td>€${parseFloat(ev.prezzo_intero).toFixed(2)}</td>
                            <td style="display:flex; gap:8px; flex-wrap:wrap;">
                                <button class="btn-small btn-secondary modifica-evento-btn" data-id="${ev.id}">Modifica</button>
                                <button class="btn-small btn-secondary prezzi-speciali-btn" data-id="${ev.id}" data-nome="${ev.nome.replace(/"/g, '&quot;')}">Prezzi speciali</button>
                                <button class="btn-small btn-danger elimina-evento-btn" data-id="${ev.id}" data-nome="${ev.nome.replace(/"/g, '&quot;')}">Elimina</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        container.querySelectorAll('.modifica-evento-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const ev = eventiList.find(e => e.id === btn.dataset.id);
                if (ev) openEventoModal(ev);
            });
        });

        container.querySelectorAll('.prezzi-speciali-btn').forEach(btn => {
            btn.addEventListener('click', () => openPrezziSpecialiModal(btn.dataset.id, btn.dataset.nome));
        });

        container.querySelectorAll('.elimina-evento-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm(`Eliminare l'evento "${btn.dataset.nome}"?\nNon è possibile eliminare eventi con vendite registrate.`)) return;
                btn.disabled = true;
                try {
                    await apiCall('DELETE', `/eventi/${btn.dataset.id}`);
                    showAlert('Evento eliminato', 'success');
                    loadAdminEventi();
                    loadEventi();
                } catch (error) {
                    const msg = error.message === 'evento_con_vendite'
                        ? 'Impossibile eliminare: esistono vendite per questo evento'
                        : error.message;
                    showAlert(`Errore: ${msg}`, 'error');
                    btn.disabled = false;
                }
            });
        });

    } catch (error) {
        showAlert(`Errore caricamento eventi: ${error.message}`, 'error', container);
    }
}

function openEventoModal(evento = null) {
    document.getElementById('eventoModalTitle').textContent = evento ? 'Modifica Evento' : 'Nuovo Evento';
    document.getElementById('eventoId').value = evento ? evento.id : '';
    document.getElementById('eventoNome').value = evento ? evento.nome : '';
    document.getElementById('eventoData').value = evento
        ? (evento.data || '').replace(' ', 'T').substring(0, 16)
        : '';
    document.getElementById('eventoLuogo').value = evento ? (evento.luogo || '') : '';
    document.getElementById('eventoPrezzo').value = evento ? evento.prezzo_intero : '';
    document.getElementById('eventoResult').innerHTML = '';
    showModal('eventoModal');
}

async function handleSalvaEvento(e) {
    e.preventDefault();
    const id = document.getElementById('eventoId').value;
    const nome = document.getElementById('eventoNome').value.trim();
    const data = document.getElementById('eventoData').value.replace('T', ' ');
    const luogo = document.getElementById('eventoLuogo').value.trim();
    const prezzo_intero = parseFloat(document.getElementById('eventoPrezzo').value);
    const resultContainer = document.getElementById('eventoResult');

    try {
        if (id) {
            await apiCall('PATCH', `/eventi/${id}`, { nome, data, luogo, prezzo_intero });
        } else {
            await apiCall('POST', '/eventi', { nome, data, luogo, prezzo_intero });
        }
        showAlert(id ? 'Evento aggiornato' : 'Evento creato', 'success', resultContainer);
        setTimeout(() => {
            closeModal('eventoModal');
            loadAdminEventi();
            loadEventi();
        }, 800);
    } catch (error) {
        showAlert(`Errore: ${error.message}`, 'error', resultContainer);
    }
}

// ======================
// PREZZI SPECIALI EVENTO
// ======================

async function openPrezziSpecialiModal(eventoId, eventoNome) {
    document.getElementById('prezziSpecialiTitle').textContent = `Prezzi speciali — ${eventoNome}`;
    document.getElementById('prezziSpecialiEventoId').value = eventoId;
    document.getElementById('prezziSpecialiResult').innerHTML = '';

    const tableEl = document.getElementById('prezziSpecialiTable');
    tableEl.innerHTML = '<p>Caricamento…</p>';
    showModal('prezziSpecialiModal');

    try {
        const [tariffeRes, overridesRes] = await Promise.all([
            apiCall('GET', '/admin/tariffe'),
            apiCall('GET', `/eventi/${eventoId}/tariffe`)
        ]);

        const tuttiPrezzi = tariffeRes.tariffe;
        const overrideMap = {};
        overridesRes.tariffe.forEach(o => { overrideMap[o.categoria] = o.prezzo; });

        tableEl.innerHTML = `
            <table class="table">
                <thead>
                    <tr>
                        <th>Categoria</th>
                        <th>Prezzo standard</th>
                        <th>Prezzo speciale (€)</th>
                    </tr>
                </thead>
                <tbody>
                    ${tuttiPrezzi.map(t => `
                        <tr>
                            <td><strong>${t.categoria}</strong></td>
                            <td style="color:var(--text-muted)">€${parseFloat(t.prezzo).toFixed(2)}</td>
                            <td>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    class="prezzo-speciale-input"
                                    data-categoria="${t.categoria}"
                                    value="${overrideMap[t.categoria] !== undefined ? overrideMap[t.categoria] : ''}"
                                    placeholder="Standard"
                                    style="width:100px;"
                                >
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (error) {
        tableEl.innerHTML = `<p style="color:var(--error)">Errore: ${error.message}</p>`;
    }
}

async function handleSalvaPrezziSpeciali() {
    const eventoId = document.getElementById('prezziSpecialiEventoId').value;
    const resultContainer = document.getElementById('prezziSpecialiResult');

    const inputs = document.querySelectorAll('.prezzo-speciale-input');
    const overrides = [];
    for (const input of inputs) {
        if (input.value.trim() !== '') {
            const prezzo = parseFloat(input.value);
            if (isNaN(prezzo) || prezzo < 0) {
                showAlert('Prezzo non valido per ' + input.dataset.categoria, 'error', resultContainer);
                return;
            }
            overrides.push({ categoria: input.dataset.categoria, prezzo });
        }
    }

    const btn = document.getElementById('salvaPrezziSpecialiBtn');
    btn.disabled = true;
    try {
        await apiCall('PUT', `/eventi/${eventoId}/tariffe`, overrides);
        showAlert(`Salvati ${overrides.length} prezzi speciali`, 'success', resultContainer);
        setTimeout(() => closeModal('prezziSpecialiModal'), 900);
    } catch (error) {
        showAlert(`Errore: ${error.message}`, 'error', resultContainer);
    } finally {
        btn.disabled = false;
    }
}

// ======================
// ADMIN — TARIFFE
// ======================

async function loadTariffe() {
    try {
        const result = await apiCall('GET', '/admin/tariffe');
        tariffe = result.tariffe;
        populateCategoriaSelects();
        populateListino();
    } catch (error) {
        console.error('Errore caricamento tariffe:', error);
    }
}

function populateListino() {
    const container = document.getElementById('listino-prezzi-grid');
    if (!container || tariffe.length === 0) return;
    container.innerHTML = tariffe.map(t => `
        <div class="alert-info" style="margin:0; text-align:center;">
            <strong>${t.categoria}</strong><br>€${parseFloat(t.prezzo).toFixed(2)}
        </div>
    `).join('');
}

function populateCategoriaSelects() {
    const targets = [
        { id: 'categoriaPersona',  emptyLabel: '-- Seleziona categoria --' },
        { id: 'filtroCategoria',   emptyLabel: '-- Tutte le categorie --' },
        { id: 'modificaCategoria', emptyLabel: '-- Seleziona --' }
    ];
    targets.forEach(({ id, emptyLabel }) => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const prev = sel.value;
        sel.innerHTML = `<option value="">${emptyLabel}</option>`;
        tariffe.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.categoria;
            opt.textContent = `${t.categoria}  —  €${parseFloat(t.prezzo).toFixed(2)}`;
            sel.appendChild(opt);
        });
        if (prev) sel.value = prev;
    });
}

async function loadAdminTariffe() {
    const container = document.getElementById('tariffeAdminResult');
    if (!container) return;

    try {
        const result = await apiCall('GET', '/admin/tariffe');
        tariffe = result.tariffe;
        populateCategoriaSelects();

        if (tariffe.length === 0) {
            container.innerHTML = '<div class="alert alert-info">Nessuna tariffa configurata.</div>';
            return;
        }

        container.innerHTML = `
            <table class="table">
                <thead>
                    <tr>
                        <th>Categoria</th>
                        <th>Prezzo</th>
                        <th>Azioni</th>
                    </tr>
                </thead>
                <tbody>
                    ${tariffe.map(t => `
                        <tr>
                            <td>
                                <div style="display:flex; align-items:center; gap:10px;">
                                    <span style="display:inline-block; width:14px; height:14px; border-radius:3px; background:${t.colore || '#4d4c4c'}; flex-shrink:0;"></span>
                                    <strong>${t.categoria}</strong>
                                </div>
                            </td>
                            <td>€${parseFloat(t.prezzo).toFixed(2)}</td>
                            <td style="display:flex; gap:8px;">
                                <button class="btn-small btn-secondary modifica-tariffa-btn"
                                    data-categoria="${t.categoria}" data-prezzo="${t.prezzo}" data-colore="${t.colore || '#4d4c4c'}">
                                    Modifica
                                </button>
                                <button class="btn-small btn-danger elimina-tariffa-btn"
                                    data-categoria="${t.categoria}">
                                    Elimina
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        container.querySelectorAll('.modifica-tariffa-btn').forEach(btn => {
            btn.addEventListener('click', () => openTariffaModal(btn.dataset.categoria, btn.dataset.prezzo, btn.dataset.colore));
        });

        container.querySelectorAll('.elimina-tariffa-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const cat = btn.dataset.categoria;
                if (!confirm(`Eliminare la tariffa "${cat}"?\nI tesserini con questa categoria non avranno più sconti (prezzo intero).`)) return;
                btn.disabled = true;
                try {
                    await apiCall('DELETE', `/admin/tariffe/${encodeURIComponent(cat)}`);
                    showAlert(`Tariffa "${cat}" eliminata`, 'success');
                    loadAdminTariffe();
                    loadTariffe();
                } catch (error) {
                    showAlert(`Errore: ${error.message}`, 'error');
                    btn.disabled = false;
                }
            });
        });

    } catch (error) {
        showAlert(`Errore: ${error.message}`, 'error', container);
    }
}

function openTariffaModal(categoria, prezzo, colore = '#4d4c4c') {
    document.getElementById('tariffaCategoria').value = categoria;
    document.getElementById('tariffaCategoriaDisplay').value = categoria;
    document.getElementById('tariffaPrezzo').value = parseFloat(prezzo).toFixed(2);
    document.getElementById('tariffaColore').value = colore;
    document.getElementById('tariffaResult').innerHTML = '';
    showModal('tariffaModal');
}

async function handleSalvaTariffa(e) {
    e.preventDefault();
    const categoria = document.getElementById('tariffaCategoria').value;
    const prezzo    = parseFloat(document.getElementById('tariffaPrezzo').value);
    const colore    = document.getElementById('tariffaColore').value;
    const resultContainer = document.getElementById('tariffaResult');
    try {
        await apiCall('PATCH', `/admin/tariffe/${encodeURIComponent(categoria)}`, { prezzo, colore });
        showAlert('Tariffa aggiornata', 'success', resultContainer);
        setTimeout(() => {
            closeModal('tariffaModal');
            loadAdminTariffe();
            loadTariffe();
        }, 600);
    } catch (error) {
        showAlert(`Errore: ${error.message}`, 'error', resultContainer);
    }
}

async function handleNuovaTariffa(e) {
    e.preventDefault();
    const categoria = document.getElementById('nuovaCategoriaInput').value.trim();
    const prezzo    = parseFloat(document.getElementById('nuovoPrezzoInput').value);
    const colore    = document.getElementById('nuovoColoreInput').value;
    const resultContainer = document.getElementById('nuovaTariffaResult');
    try {
        await apiCall('POST', '/admin/tariffe', { categoria, prezzo, colore });
        showAlert(`Categoria "${categoria}" aggiunta`, 'success', resultContainer);
        document.getElementById('nuovaTariffaForm').reset();
        loadAdminTariffe();
        loadTariffe();
    } catch (error) {
        const msg = error.message === 'categoria_esistente'
            ? `La categoria "${categoria}" esiste già`
            : error.message;
        showAlert(msg, 'error', resultContainer);
    }
}

// ======================
// MODIFICA TESSERA
// ======================

function openModificaTesseraModal(personaId, nome, categoria) {
    document.getElementById('modificaPersonaId').value = personaId;
    document.getElementById('modificaNome').value = nome;
    populateCategoriaSelects();
    document.getElementById('modificaCategoria').value = categoria;
    document.getElementById('modificaTesseraResult').innerHTML = '';
    showModal('modificaTesseraModal');
}

async function handleSalvaModificaTessera(e) {
    e.preventDefault();
    const personaId = document.getElementById('modificaPersonaId').value;
    const nome = document.getElementById('modificaNome').value.trim();
    const categoria = document.getElementById('modificaCategoria').value;
    const resultContainer = document.getElementById('modificaTesseraResult');
    try {
        await apiCall('PATCH', `/persone/${personaId}`, { nome, categoria });
        showAlert('Dati aggiornati', 'success', resultContainer);
        setTimeout(() => {
            closeModal('modificaTesseraModal');
            loadTessere(document.getElementById('searchTessere').value);
            loadAdminPersone(document.getElementById('adminPersoneSearch')?.value || '');
        }, 600);
    } catch (error) {
        showAlert(`Errore: ${error.message}`, 'error', resultContainer);
    }
}

// ======================
// ADMIN — PERSONE
// ======================

async function loadAdminPersone(query = '') {
    const container = document.getElementById('personeAdminResult');
    if (!container) return;

    try {
        const params = query.trim() ? `?search=${encodeURIComponent(query.trim())}` : '';
        const result = await apiCall('GET', `/persone${params}`);
        const persone = result.persone;

        if (persone.length === 0) {
            container.innerHTML = '<div class="alert alert-info">Nessuna persona trovata.</div>';
            return;
        }

        container.innerHTML = `
            <table class="table">
                <thead>
                    <tr>
                        <th>Nome</th>
                        <th>Categoria</th>
                        <th>Tessera</th>
                        <th>Doc</th>
                        <th>Azioni</th>
                    </tr>
                </thead>
                <tbody>
                    ${persone.map(p => `
                        <tr>
                            <td><strong>${p.nome}</strong></td>
                            <td>${p.categoria}</td>
                            <td>${p.tesserino_id
                                ? `<span style="color:green;">Attiva</span> (scad. ${p.tesserino_scadenza})`
                                : '<span style="color:#999;">—</span>'
                            }</td>
                            <td>
                                <button class="status-badge doc-toggle-admin-btn ${p.doc_verificato ? 'status-success' : 'status-warning'}"
                                    style="cursor:pointer; border:none; font-size:12px;"
                                    data-id="${p.id}" data-doc="${p.doc_verificato}">
                                    ${p.doc_verificato ? 'Doc OK' : 'Doc ?'}
                                </button>
                            </td>
                            <td style="display:flex; gap:8px;">
                                <button class="btn-small btn-secondary modifica-persona-admin-btn"
                                    data-id="${p.id}"
                                    data-nome="${p.nome.replace(/"/g, '&quot;')}"
                                    data-categoria="${p.categoria}">
                                    Modifica
                                </button>
                                <button class="btn-small btn-danger elimina-persona-admin-btn"
                                    data-id="${p.id}"
                                    data-nome="${p.nome.replace(/"/g, '&quot;')}"
                                    data-tessera="${!!p.tesserino_id}">
                                    Elimina
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        container.querySelectorAll('.modifica-persona-admin-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                openModificaTesseraModal(
                    btn.dataset.id,
                    btn.dataset.nome.replace(/&quot;/g, '"'),
                    btn.dataset.categoria
                );
            });
        });

        container.querySelectorAll('.elimina-persona-admin-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const nome = btn.dataset.nome.replace(/&quot;/g, '"');
                const haTessera = btn.dataset.tessera === 'true';
                const avviso = haTessera
                    ? `Eliminare "${nome}"?\nATTENZIONE: ha una tessera attiva che verrà eliminata insieme.`
                    : `Eliminare "${nome}"?`;
                if (!confirm(avviso)) return;
                btn.disabled = true;
                try {
                    await apiCall('DELETE', `/persone/${btn.dataset.id}`);
                    loadAdminPersone(document.getElementById('adminPersoneSearch').value);
                } catch (error) {
                    showAlert(`Errore: ${error.message}`, 'error');
                    btn.disabled = false;
                }
            });
        });

        container.querySelectorAll('.doc-toggle-admin-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const nuovoStato = btn.dataset.doc !== 'true';
                btn.disabled = true;
                try {
                    await apiCall('PATCH', `/persone/${btn.dataset.id}`, { doc_verificato: nuovoStato });
                    loadAdminPersone(document.getElementById('adminPersoneSearch').value);
                } catch (error) {
                    showAlert(`Errore: ${error.message}`, 'error');
                    btn.disabled = false;
                }
            });
        });

    } catch (error) {
        showAlert(`Errore: ${error.message}`, 'error', container);
    }
}

// ======================
// ANALYTICS VENDITE
// ======================

async function loadVenditeReport() {
    try {
        const [data, giornata] = await Promise.all([
            apiCall('GET', '/report/vendite'),
            apiCall('GET', '/report/giornata')
        ]);

        // KPI
        document.getElementById('kpiTessere').textContent   = data.totale_tessere;
        document.getElementById('kpiIncasso').textContent   = '€ ' + Number(data.incasso_totale).toFixed(2);
        document.getElementById('kpiIncassoSub').textContent =
            'tessere €' + Number(data.incasso_vendite).toFixed(2) + ' + speciali €' + Number(data.incasso_speciali).toFixed(2);

        const totAccrediti = Number(data.totale_accrediti) + Number(data.n_accrediti_speciali);
        document.getElementById('kpiAccrediti').textContent  = totAccrediti;
        document.getElementById('kpiAccreditiSub').textContent =
            data.totale_accrediti + ' tessere · ' + data.n_accrediti_speciali + ' presidenziali';

        document.getElementById('kpiSpeciali').textContent  = data.n_accrediti_speciali;
        document.getElementById('kpiSpecialiSub').textContent =
            'di cui ' + data.n_speciali_gratuiti + ' gratuiti · €' + Number(data.incasso_speciali).toFixed(2) + ' incassati';

        // Per categoria
        const totScontoCategorie = data.per_categoria.reduce(
            (acc, r) => acc + (20 * Number(r.n_accrediti) - Number(r.incasso)), 0
        );
        const totScontoSpeciali = 20 * Number(data.n_accrediti_speciali) - Number(data.incasso_speciali);
        const totSconto = totScontoCategorie + totScontoSpeciali;
        document.getElementById('kpiSconto').textContent = '– € ' + totSconto.toFixed(2);
        document.getElementById('venditePerCategoriaBody').innerHTML = data.per_categoria.length
            ? data.per_categoria.map(r => {
                const sconto    = 20 * Number(r.n_accrediti) - Number(r.incasso);
                const pctSconto = totSconto > 0 ? (sconto / totSconto * 100).toFixed(1) : '0.0';
                const colore    = r.colore || '#4d4c4c';
                return `<tr>
                    <td style="display:flex;align-items:center;gap:6px;">
                        <span class="cat-dot" style="background:${colore};"></span>${r.categoria}
                    </td>
                    <td style="text-align:center;">${r.n_tessere}</td>
                    <td style="text-align:center;">${r.n_urbino}</td>
                    <td style="text-align:right;">€ ${Number(r.incasso).toFixed(2)}</td>
                    <td style="text-align:right; color: var(--red);">– € ${sconto.toFixed(2)}</td>
                    <td style="text-align:right;">${pctSconto}%</td>
                </tr>`;
            }).join('')
            : '<tr><td colspan="6" style="text-align:center;color:var(--gray);padding:24px;">Nessun dato</td></tr>';

        // Per evento
        document.getElementById('venditePerEventoBody').innerHTML = data.per_evento.length
            ? data.per_evento.map(r => {
                const data_fmt = r.data ? new Date(r.data).toLocaleDateString('it-IT') : '—';
                const nSpec    = Number(r.n_speciali);
                const incSpec  = Number(r.incasso_speciali);
                const sconto   = 20 * (Number(r.n_accrediti) + nSpec) - (Number(r.incasso) + incSpec);
                return `<tr>
                    <td>${r.nome}</td>
                    <td style="text-align:center;">${data_fmt}</td>
                    <td style="text-align:center;">${r.n_accrediti}</td>
                    <td style="text-align:right;">€ ${Number(r.incasso).toFixed(2)}</td>
                    <td style="text-align:right; color: var(--red);">– € ${sconto.toFixed(2)}</td>
                    <td style="text-align:center; color:${nSpec > 0 ? '#7B5E00' : 'var(--gray)'};">${nSpec > 0 ? nSpec : '—'}</td>
                    <td style="text-align:right; color:${nSpec > 0 ? '#7B5E00' : 'var(--gray)'};">${nSpec > 0 ? '€ ' + incSpec.toFixed(2) : '—'}</td>
                </tr>`;
            }).join('')
            : '<tr><td colspan="7" style="text-align:center;color:var(--gray);padding:24px;">Nessun evento</td></tr>';

        // Per giornata
        document.getElementById('venditePerGiornataBody').innerHTML = giornata.report.length
            ? giornata.report.map(r => {
                const giorno = new Date(r.giorno).toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit' });
                const nSpecG    = Number(r.n_speciali || 0);
                const mancanteG = 20 * (Number(r.totale_redenzioni) + nSpecG) - Number(r.incasso);
                return `<tr>
                    <td style="white-space:nowrap;">${giorno}</td>
                    <td style="text-align:center;">${r.totale_redenzioni}</td>
                    <td style="text-align:center; color:${r.redenzioni_annullate > 0 ? 'var(--red)' : 'inherit'};">${r.redenzioni_annullate}</td>
                    <td style="text-align:center;">${r.n_studenti}</td>
                    <td style="text-align:center;">${r.n_docenti}</td>
                    <td style="text-align:center;">${r.n_strumentisti}</td>
                    <td style="text-align:center;">${r.n_urbinati}</td>
                    <td style="text-align:center; color:${nSpecG > 0 ? '#7B5E00' : 'var(--gray)'}">${nSpecG > 0 ? nSpecG : '—'}</td>
                    <td style="text-align:right;">€ ${Number(r.incasso).toFixed(2)}</td>
                    <td style="text-align:right; color:var(--red);">– € ${mancanteG.toFixed(2)}</td>
                </tr>`;
            }).join('')
            : '<tr><td colspan="10" style="text-align:center;color:var(--gray);padding:24px;">Nessun dato</td></tr>';

        // Accrediti presidenziali — dettaglio
        document.getElementById('specialiBody').innerHTML = (data.ultimi_speciali || []).length
            ? data.ultimi_speciali.map(a => {
                const isZero = parseFloat(a.prezzo_pagato) === 0;
                const quando = new Date(a.creato_at).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
                return `<tr>
                    <td>${a.beneficiario || '<em style="color:var(--gray);">anonimo</em>'}</td>
                    <td>${a.evento_nome}</td>
                    <td style="text-align:right; font-weight:700; color:${isZero ? '#e67e22' : 'var(--green)'};">€ ${Number(a.prezzo_pagato).toFixed(2)}</td>
                    <td style="text-align:center;">${a.operatore}</td>
                    <td style="text-align:center; white-space:nowrap; color:var(--gray); font-size:12px;">${quando}</td>
                </tr>`;
            }).join('')
            : '<tr><td colspan="5" style="text-align:center;color:var(--gray);padding:24px;">Nessun accredito presidenziale registrato</td></tr>';

    } catch (error) {
        showAlert(`Errore caricamento analytics: ${error.message}`, 'error');
    }
}

// ======================
// AUDIT LOG
// ======================

const AZIONE_LABEL = {
    utente_creato:       'Utente creato',
    utente_abilitato:    'Utente abilitato',
    utente_disabilitato: 'Utente disabilitato',
    tariffa_creata:      'Tariffa creata',
    tariffa_modificata:  'Tariffa modificata',
    persona_creata:      'Persona creata',
    persona_eliminata:   'Persona eliminata',
    persona_modificata:  'Persona modificata',
    import_persone:      'Import persone',
    import_tesserini:    'Import tesserini',
    import_eventi:       'Import eventi',
    tesserino_creato:    'Tesserino creato',
    tesserino_revocato:  'Tesserino revocato',
    evento_creato:       'Evento creato',
    evento_modificato:   'Evento modificato',
    accredito_concesso:  'Accredito concesso',
    accredito_annullato: 'Accredito annullato',
    omaggio_registrato:  'Omaggio registrato',
    organico_aggiunto:   'Organico aggiunto',
    organico_rimosso:    'Organico rimosso',
    accredito_speciale:  'Accredito speciale',
};

function formatAuditDetail(azione, det) {
    if (!det) return [];
    const rows = [];
    if (azione === 'utente_creato' || azione === 'utente_abilitato' || azione === 'utente_disabilitato') {
        if (det.username) rows.push(['Username', det.username]);
    } else if (azione === 'tariffa_creata') {
        rows.push(['Categoria', det.categoria], ['Prezzo', `€ ${det.prezzo}`], ['Colore', det.colore]);
    } else if (azione === 'tariffa_modificata') {
        rows.push(['Categoria', det.categoria]);
        if (det.modifiche) Object.entries(det.modifiche).forEach(([k, v]) => rows.push([k, `${v}`]));
    } else if (azione === 'persona_creata') {
        rows.push(['Nome', det.nome], ['Categoria', det.categoria]);
    } else if (azione === 'persona_eliminata') {
        rows.push(['Nome', det.nome], ['Aveva tessera attiva', det.aveva_tessera_attiva ? 'Sì' : 'No']);
    } else if (azione === 'persona_modificata') {
        rows.push(['Nome', det.nome]);
        if (det.modifiche) Object.entries(det.modifiche).forEach(([k, v]) => rows.push([k, `${v.da} → ${v.a}`]));
    } else if (azione === 'import_persone') {
        rows.push(['Importate', det.importate], ['Errori', det.n_errori]);
    } else if (azione === 'import_tesserini' || azione === 'import_eventi') {
        rows.push(['Importati', det.importati], ['Errori', det.n_errori]);
    } else if (azione === 'tesserino_creato') {
        rows.push(['Persona', det.persona_nome], ['Scadenza', det.exp_date]);
    } else if (azione === 'tesserino_revocato') {
        rows.push(['Persona', det.persona_nome], ['Motivo', det.motivo]);
    } else if (azione === 'evento_creato') {
        rows.push(['Nome', det.nome], ['Data', det.data], ['Luogo', det.luogo || '—']);
    } else if (azione === 'evento_modificato') {
        rows.push(['Evento', det.nome]);
        if (det.modifiche) Object.entries(det.modifiche).forEach(([k, v]) => rows.push([k, `${v.da} → ${v.a}`]));
    } else if (azione === 'accredito_concesso') {
        rows.push(['Persona', det.persona_nome], ['Evento', det.evento_nome]);
        if (det.con_portatore) rows.push(['Modalità', 'Con portatore']);
    } else if (azione === 'accredito_annullato') {
        rows.push(['Persona', det.persona_nome], ['Evento', det.evento_nome], ['Motivo', det.motivo]);
    } else if (azione === 'omaggio_registrato') {
        rows.push(['Strumentista', det.strumentista], ['Evento', det.evento], ['Ospite', det.ospite || 'anonimo']);
    } else if (azione === 'organico_aggiunto' || azione === 'organico_rimosso') {
        rows.push(['Persona', det.persona], ['Evento', det.evento]);
    } else if (azione === 'accredito_speciale') {
        rows.push(['Evento', det.evento], ['Beneficiario', det.beneficiario || 'anonimo'], ['Prezzo', `€${det.prezzo}`]);
    }
    return rows;
}

async function loadLog() {
    try {
        const azione = document.getElementById('filtroAzioneLog').value;
        const url = '/report/log' + (azione ? `?azione=${encodeURIComponent(azione)}` : '');
        const data = await apiCall('GET', url);

        const tbody = document.getElementById('auditLogBody');
        if (!data.log.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--gray);padding:24px;">Nessun evento registrato</td></tr>';
            return;
        }

        tbody.innerHTML = data.log.map(row => {
            const ts  = new Date(row.timestamp).toLocaleString('it-IT');
            const lbl = AZIONE_LABEL[row.azione] || row.azione;
            const det = typeof row.dettagli === 'string' ? JSON.parse(row.dettagli) : row.dettagli;
            const hasDetail = det && Object.keys(det).length > 0;
            return `<tr data-log-id="${row.id}">
                <td style="white-space:nowrap; font-size:0.85em; color:var(--gray);">${ts}</td>
                <td>${lbl}</td>
                <td style="text-align:center; font-size:0.9em;">${row.operatore}</td>
                <td style="text-align:center;">${row.n_elementi}</td>
                <td style="text-align:center;">${hasDetail
                    ? `<button class="btn-secondary btn-small log-detail-btn" style="padding:2px 8px; font-size:0.8em;" data-log-id="${row.id}">•••</button>`
                    : ''
                }</td>
            </tr>
            <tr id="log-detail-${row.id}" style="display:none;">
                <td colspan="5" style="padding:8px 24px 12px; background:var(--light-gray, #f5f5f5);">
                    <table style="font-size:0.85em; border-collapse:collapse;">
                        ${formatAuditDetail(row.azione, det).map(([k, v]) =>
                            `<tr><td style="padding:2px 12px 2px 0; color:var(--gray); white-space:nowrap;">${k}</td><td>${v ?? '—'}</td></tr>`
                        ).join('')}
                    </table>
                </td>
            </tr>`;
        }).join('');
    } catch (error) {
        showAlert(`Errore caricamento log: ${error.message}`, 'error');
    }
}

function toggleLogDetail(btn, id) {
    const row = document.getElementById(`log-detail-${id}`);
    if (!row) return;
    const open = row.style.display !== 'none';
    row.style.display = open ? 'none' : 'table-row';
    btn.textContent = open ? '•••' : '▲';
}

// Wire up audit log controls after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('aggiornaLogBtn')?.addEventListener('click', loadLog);
    document.getElementById('auditLogBody')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.log-detail-btn');
        if (!btn) return;
        toggleLogDetail(btn, btn.dataset.logId);
    });
});

// ======================
// ORGANICO ADMIN
// ======================

async function loadOrganico() {
    const container = document.getElementById('organicoResult');
    container.innerHTML = '<p style="color:var(--gray);">Caricamento...</p>';

    try {
        const data = await apiCall('GET', '/admin/organico');
        const { eventi, strumentisti } = data;

        if (!eventi.length) {
            container.innerHTML = '<p style="color:var(--gray);">Nessun evento configurato.</p>';
            return;
        }

        container.innerHTML = eventi.map(ev => {
            const chips = ev.strumentisti.map(s => `
                <span class="organico-chip">
                    ${s.nome}
                    <button class="organico-chip-rm" aria-label="Rimuovi ${s.nome}"
                        data-persona-id="${s.persona_id}" data-evento-id="${ev.id}">×</button>
                </span>`).join('');

            return `
                <div class="organico-evento-card" data-evento-id="${ev.id}">
                    <div class="organico-evento-header">
                        <strong>${ev.nome}</strong>
                        <small style="color:var(--gray);">${ev.data}</small>
                    </div>
                    <div class="organico-chips" id="chips-${ev.id}">
                        ${chips}
                        <div class="organico-dropdown" id="dd-${ev.id}">
                            <button class="organico-add-btn" data-evento-id="${ev.id}">+ aggiungi</button>
                        </div>
                    </div>
                </div>`;
        }).join('');

        // Event delegation: rimozione chip
        container.addEventListener('click', async (e) => {
            const rmBtn = e.target.closest('.organico-chip-rm');
            if (rmBtn) {
                const { personaId, eventoId } = rmBtn.dataset;
                rmBtn.disabled = true;
                try {
                    await apiCall('DELETE', `/admin/organico/${personaId}/${eventoId}`);
                    loadOrganico();
                } catch (err) {
                    showAlert(`Errore: ${err.message}`, 'error', container);
                    rmBtn.disabled = false;
                }
                return;
            }

            // Apri dropdown aggiungi
            const addBtn = e.target.closest('.organico-add-btn');
            if (addBtn) {
                const eventoId = addBtn.dataset.eventoId;
                openOrganicoPicker(eventoId, strumentisti, ev => ev.id === eventoId ? ev.strumentisti : []);
            }
        });

    } catch (error) {
        container.innerHTML = `<p style="color:var(--red);">Errore: ${error.message}</p>`;
    }
}

function openOrganicoPicker(eventoId, tuttiStrumentisti, getAssegnati) {
    // Rimuovi picker già aperto
    document.querySelectorAll('.organico-select-list').forEach(el => el.remove());

    const dd = document.getElementById(`dd-${eventoId}`);
    if (!dd) return;

    // Costruisce la lista di già-assegnati dall'HTML corrente
    const chipsEl = document.getElementById(`chips-${eventoId}`);
    const assegnatiIds = new Set(
        [...chipsEl.querySelectorAll('.organico-chip-rm')].map(b => b.dataset.personaId)
    );
    const disponibili = tuttiStrumentisti.filter(s => !assegnatiIds.has(s.id));

    const list = document.createElement('div');
    list.className = 'organico-select-list';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Cerca...';
    list.appendChild(input);

    const renderOptions = (filter = '') => {
        list.querySelectorAll('.organico-option, .organico-empty').forEach(el => el.remove());
        const filtrati = disponibili.filter(s =>
            s.nome.toLowerCase().includes(filter.toLowerCase())
        );
        if (!filtrati.length) {
            const empty = document.createElement('div');
            empty.className = 'organico-empty';
            empty.textContent = disponibili.length ? 'Nessun risultato' : 'Tutti già assegnati';
            list.appendChild(empty);
        } else {
            filtrati.forEach(s => {
                const opt = document.createElement('div');
                opt.className = 'organico-option';
                opt.textContent = s.nome;
                opt.addEventListener('click', async () => {
                    list.remove();
                    try {
                        await apiCall('POST', '/admin/organico', { persona_id: s.id, evento_id: eventoId });
                        loadOrganico();
                    } catch (err) {
                        showAlert(`Errore: ${err.message}`, 'error', document.getElementById('organicoResult'));
                    }
                });
                list.appendChild(opt);
            });
        }
    };

    renderOptions();
    input.addEventListener('input', () => renderOptions(input.value));
    dd.appendChild(list);
    input.focus();

    // Chiudi se click fuori
    const close = (e) => {
        if (!list.contains(e.target) && e.target !== dd.querySelector('.organico-add-btn')) {
            list.remove();
            document.removeEventListener('click', close, true);
        }
    };
    setTimeout(() => document.addEventListener('click', close, true), 0);
}
