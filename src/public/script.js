// State management
let currentUser = null;
let currentTesseraId = null;
let currentPersonaId = null;
let eventi = [];
let currentPage = 'main';
let currentSort = { field: 'created_at', order: 'desc' };
let tessereData = [];

// DOM elements
const loginSection = document.getElementById('loginSection');
const mainInterface = document.getElementById('mainInterface');
const userInfo = document.getElementById('userInfo');
const tesseraSection = document.getElementById('tesseraSection');

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    // Check if user is already logged in
    const savedUser = sessionStorage.getItem('umaUser');
    if (savedUser) {
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
    document.getElementById('venditaForm').addEventListener('submit', handleVendita);
    document.getElementById('statoForm').addEventListener('submit', handleStatoTessera);
    document.getElementById('loadReportBtn').addEventListener('click', loadReport);
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
            headers: {
                'Content-Type': 'application/json'
            }
        };
        
        if (data) {
            options.body = JSON.stringify(data);
        }
        
        const response = await fetch(endpoint, options);
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Errore di rete');
        }
        
        return result;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// Show alert message
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
    
    if (!username) {
        showAlert('Inserisci un nome operatore', 'error', document.getElementById('qrResult'));
        return;
    }
    
    try {
        const result = await apiCall('POST', '/auth/login', { username });
        currentUser = result.user;
        sessionStorage.setItem('umaUser', JSON.stringify(currentUser));
        showMainInterface();
    } catch (error) {
        showAlert('Errore durante il login: ' + error.message, 'error', document.getElementById('qrResult'));
    }
}

// Show main interface after login
function showMainInterface() {
    loginSection.classList.add('hidden');
    mainInterface.classList.remove('hidden');
    userInfo.textContent = `Operatore: ${currentUser.name}`;
    
    // Load eventi when showing main interface
    loadEventi();
    
    // Setup navigation
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
        showAlert(`❌ QR Non Valido: ${error.message}`, 'error', resultContainer);
        tesseraSection.style.display = 'none';
        currentTesseraId = null;
    }
}

// Load tessera information
async function loadTesseraInfo(tesseraId) {
    try {
        const result = await apiCall('GET', `/tessere/${tesseraId}`);
        const tessera = result.tessera;
        const eventi = result.eventi;
        
        // Calculate discount price based on category
        const priceMap = {
            'studente': 9,
            'docente': 5,
            'strumentista': 9,
            'urbinate_u18_o70': 15,
            'altro': 20
        };
        const discountPrice = priceMap[tessera.categoria] || 20;
        
        const infoHtml = `
            <div class="tessera-info">
                <h4>👤 ${tessera.nome}</h4>
                <p><strong>Categoria:</strong> ${tessera.categoria}</p>
                <p><strong>Prezzo eventi:</strong> <span style="color: #007aff; font-weight: bold;">€${discountPrice}</span> ${discountPrice < 20 ? '(scontato da €20)' : ''}</p>
                <p><strong>Stato:</strong> <span class="status-badge ${tessera.stato === 'attivo' ? 'status-success' : 'status-error'}">${tessera.stato}</span></p>
                <p><strong>Scadenza:</strong> ${tessera.exp_date}</p>
                <p><strong>Doc. Verificato:</strong> ${tessera.doc_verificato ? '✅' : '❌'}</p>
                
                <div style="margin-top: 1rem; display: flex; gap: 10px;">
                    ${tessera.stato === 'attivo' ? 
                        `<button type="button" class="btn-danger btn-small" id="revocaTesseraBtn">🚫 Revoca Tesserino</button>` : 
                        `<button type="button" class="btn-success btn-small" id="nuovoTesseraBtn" data-persona-id="${tessera.persona_id}">➕ Nuovo Tesserino</button>`
                    }
                </div>
            </div>
            
            <h4 style="margin-top: 1rem;">Eventi Disponibili:</h4>
            <div style="margin-top: 0.5rem;">
                ${eventi.map(evento => `
                    <div class="evento-item ${evento.redento ? 'redento' : ''}">
                        <div>
                            <strong>${evento.nome}</strong><br>
                            <small>${evento.data}</small>
                        </div>
                        <div>
                            ${evento.redento ? '<span class="status-badge status-success">✅ Redento</span>' : '<span class="status-badge status-warning">Disponibile</span>'}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        
        document.getElementById('tesseraInfo').innerHTML = infoHtml;
        tesseraSection.style.display = 'block';
        
        // Add event listeners for dynamic buttons
        setupTesseraButtons(tessera);
        
    } catch (error) {
        showAlert(`Errore caricamento tessera: ${error.message}`, 'error', document.getElementById('tesseraInfo'));
    }
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
            operatore: currentUser.name
        });
        
        showAlert(`✅ Vendita completata! Prezzo: €${result.prezzo}`, 'success', resultContainer);
        
        // Reload tessera info to show updated status
        await loadTesseraInfo(currentTesseraId);
        
    } catch (error) {
        let errorMsg = error.message;
        if (error.message === 'duplicato') {
            errorMsg = 'Tessera già utilizzata per questo evento';
        } else if (error.message === 'tessera_non_attiva') {
            errorMsg = 'Tessera non attiva o revocata';
        }
        showAlert(`❌ Errore vendita: ${errorMsg}`, 'error', resultContainer);
    }
}

// Load report
async function loadReport() {
    const resultContainer = document.getElementById('reportResult');
    
    try {
        const result = await apiCall('GET', '/report/giornata');
        const reports = result.report;
        
        if (reports.length === 0) {
            showAlert('Nessuna vendita registrata', 'info', resultContainer);
            return;
        }
        
        const tableHtml = `
            <table class="table">
                <thead>
                    <tr>
                        <th>Giorno</th>
                        <th>Studenti</th>
                        <th>Docenti</th>
                        <th>Strumentisti</th>
                        <th>Urbinati</th>
                        <th>Incasso</th>
                    </tr>
                </thead>
                <tbody>
                    ${reports.map(r => `
                        <tr>
                            <td>${r.giorno}</td>
                            <td>${r.n_studenti}</td>
                            <td>${r.n_docenti}</td>
                            <td>${r.n_strumentisti}</td>
                            <td>${r.n_urbinati}</td>
                            <td><strong>€${r.incasso}</strong></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        
        resultContainer.innerHTML = tableHtml;
        
    } catch (error) {
        showAlert(`Errore caricamento report: ${error.message}`, 'error', resultContainer);
    }
}

// Handle stato tessera
async function handleStatoTessera(e) {
    e.preventDefault();
    const tesseraId = document.getElementById('tesseraIdInput').value.trim();
    const resultContainer = document.getElementById('statoResult');
    
    if (!tesseraId) {
        showAlert('Inserisci un ID tessera', 'error', resultContainer);
        return;
    }
    
    try {
        const result = await apiCall('GET', `/tessere/${tesseraId}`);
        const tessera = result.tessera;
        const eventi = result.eventi;
        
        const infoHtml = `
            <div class="tessera-info">
                <h4>👤 ${tessera.nome}</h4>
                <p><strong>Categoria:</strong> ${tessera.categoria}</p>
                <p><strong>Stato:</strong> <span class="status-badge ${tessera.stato === 'attivo' ? 'status-success' : 'status-error'}">${tessera.stato}</span></p>
                <p><strong>Scadenza:</strong> ${tessera.exp_date}</p>
                <p><strong>Doc. Verificato:</strong> ${tessera.doc_verificato ? '✅' : '❌'}</p>
            </div>
            
            <h4 style="margin-top: 1rem;">Storia Eventi:</h4>
            <div style="margin-top: 0.5rem;">
                ${eventi.map(evento => `
                    <div class="evento-item ${evento.redento ? 'redento' : ''}">
                        <div>
                            <strong>${evento.nome}</strong><br>
                            <small>${evento.data}</small>
                        </div>
                        <div>
                            ${evento.redento ? '<span class="status-badge status-success">✅ Redento</span>' : '<span class="status-badge status-warning">Non Redento</span>'}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        
        resultContainer.innerHTML = infoHtml;
        
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
            showAlert('Nessuna redenzione registrata', 'info', resultContainer);
            return;
        }
        
        const tableHtml = `
            <table class="table">
                <thead>
                    <tr>
                        <th>Timestamp</th>
                        <th>Tessera</th>
                        <th>Evento</th>
                        <th>Operatore</th>
                        <th>Esito</th>
                        <th>Stato</th>
                    </tr>
                </thead>
                <tbody>
                    ${redenzioni.slice(0, 20).map(r => `
                        <tr>
                            <td>${new Date(r.timestamp).toLocaleString('it-IT')}</td>
                            <td>${r.tesserino_id.substring(0, 8)}...</td>
                            <td>${r.evento_nome}</td>
                            <td>${r.operatore}</td>
                            <td>
                                <span class="status-badge ${r.esito === 'ok' ? 'status-success' : 'status-error'}">
                                    ${r.esito}
                                </span>
                            </td>
                            <td>
                                ${r.annullata ? 
                                    `<span class="status-badge status-error">❌ Annullata</span><br><small>${r.annullata_operatore} - ${new Date(r.annullata_timestamp).toLocaleString('it-IT')}</small>` : 
                                    `<span class="status-badge status-success">✅ Attiva</span>`
                                }
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        
        resultContainer.innerHTML = tableHtml;
        
    } catch (error) {
        showAlert(`Errore caricamento redenzioni: ${error.message}`, 'error', resultContainer);
    }
}

// Load redenzioni annullabili
async function loadAnnullabili() {
    const resultContainer = document.getElementById('annullabiliResult');
    
    try {
        const result = await apiCall('GET', '/redenzioni/annullabili');
        const redenzioni = result.redenzioni;
        
        if (redenzioni.length === 0) {
            showAlert('Nessuna redenzione annullabile trovata (ultimi 7 giorni)', 'info', resultContainer);
            return;
        }
        
        const tableHtml = `
            <div style="margin-bottom: 1rem;">
                <div class="alert-info">
                    <strong>⚠️ Attenzione:</strong> Puoi annullare solo redenzioni degli ultimi 7 giorni.<br>
                    <small>Trovate ${redenzioni.length} redenzioni annullabili</small>
                </div>
            </div>
            <table class="table">
                <thead>
                    <tr>
                        <th>Timestamp</th>
                        <th>Persona</th>
                        <th>Evento</th>
                        <th>Operatore</th>
                        <th>Azioni</th>
                    </tr>
                </thead>
                <tbody>
                    ${redenzioni.map(r => `
                        <tr>
                            <td>${new Date(r.timestamp).toLocaleString('it-IT')}</td>
                            <td>
                                <strong>${r.persona_nome}</strong><br>
                                <small style="color: #666;">${r.categoria}</small>
                            </td>
                            <td>${r.evento_nome}</td>
                            <td>${r.operatore}</td>
                            <td>
                                <button class="btn-danger btn-small annulla-redenzione-btn" 
                                        data-redenzione-id="${r.id}" 
                                        data-persona-nome="${r.persona_nome}" 
                                        data-evento-nome="${r.evento_nome}">
                                    ❌ Annulla
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
        showAlert(`Errore caricamento redenzioni: ${error.message}`, 'error', resultContainer);
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
            const motivo = prompt(`❌ Annullare la redenzione di ${personaNome} per l'evento "${eventoNome}"?\n\nInserisci il motivo dell'annullamento:`);
            
            if (!motivo) {
                return; // User cancelled
            }
            
            try {
                // Disable button during request
                e.target.disabled = true;
                e.target.textContent = '🔄 Annullando...';
                
                await apiCall('POST', `/redenzioni/${redenzioneId}/annulla`, {
                    motivo: motivo,
                    operatore: currentUser.name
                });
                
                showAlert('✅ Redenzione annullata con successo', 'success');
                
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

// Auto-refresh functionality
setInterval(() => {
    if (currentUser) {
        // Auto-refresh report every 30 seconds if visible
        const reportContainer = document.getElementById('reportResult');
        if (reportContainer.innerHTML.includes('table')) {
            loadReport();
        }
    }
}, 30000);

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
            operatore: currentUser.name
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
            operatore: currentUser.name
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
    const nuovoBtn = document.getElementById('nuovoTesseraBtn');
    
    if (revocaBtn) {
        revocaBtn.addEventListener('click', () => {
            showModal('revocaModal');
        });
    }
    
    if (nuovoBtn) {
        currentPersonaId = nuovoBtn.dataset.personaId;
        nuovoBtn.addEventListener('click', () => {
            showModal('nuovoModal');
        });
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
            // Load tessere automatically when entering the page
            loadTessere();
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
            
            // Update tab buttons
            parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Update tab contents
            parent.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            parent.querySelector(`#${tabId}`).classList.add('active');
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
        
        const tableHtml = `
            <table class="table">
                <thead>
                    <tr>
                        <th data-sort="nome">Nome <span class="sort-indicator">${getSortIndicator('nome')}</span></th>
                        <th data-sort="stato">Stato <span class="sort-indicator">${getSortIndicator('stato')}</span></th>
                        <th data-sort="exp_date">Scadenza <span class="sort-indicator">${getSortIndicator('exp_date')}</span></th>
                        <th data-sort="created_at">Creato <span class="sort-indicator">${getSortIndicator('created_at')}</span></th>
                        <th>ID Tesserino</th>
                        <th>QR</th>
                    </tr>
                </thead>
                <tbody>
                    ${tessereData.map(t => `
                        <tr>
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
                                <button class="btn-small btn-secondary copy-qr-btn" data-qr="${t.qr_text.replace(/"/g, '&quot;')}">📋 Copia QR</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        
        resultContainer.innerHTML = tableHtml;
        
        // Add event listeners for sort and copy buttons
        setupTableEventListeners();
        
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
        residenza: document.getElementById('filtroResidenza').value.trim(),
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

// Display persone list with enhanced UI
function displayPersoneList(persone, container) {
    const listHtml = `
        <div style="max-height: 500px; overflow-y: auto; border: 1px solid #d1d1d6; border-radius: 8px;">
            <div style="background: #f8f9fa; padding: 0.75rem; border-bottom: 1px solid #d1d1d6; font-weight: 600;">
                Trovate ${persone.length} persone
            </div>
            ${persone.map(p => {
                const hasTesserino = p.tesserino_id;
                const tesserinoInfo = hasTesserino ? 
                    `ID: ${p.tesserino_id.substring(0, 8)}... | Scad: ${p.tesserino_scadenza}` : 
                    'Nessun tesserino';
                
                return `
                    <div class="evento-item" style="margin-bottom: 0; display: flex; align-items: center; justify-content: between;">
                        <div style="flex: 1;">
                            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                                <strong>${p.nome}</strong>
                                <span class="status-badge ${p.doc_verificato ? 'status-success' : 'status-warning'}">
                                    ${p.doc_verificato ? 'Doc. OK' : 'Doc. Non Ver.'}
                                </span>
                            </div>
                            <small style="color: #666;">
                                <strong>ID:</strong> ${p.id.substring(0, 8)}... | 
                                <strong>Cat:</strong> ${p.categoria} | 
                                <strong>Res:</strong> ${p.residenza || 'N/A'}
                                ${p.data_nascita ? ` | <strong>Nato:</strong> ${p.data_nascita}` : ''}
                            </small>
                            <div style="margin-top: 0.25rem; font-size: 0.875rem; color: ${hasTesserino ? '#28a745' : '#ffc107'};">
                                📋 <strong>Tesserino:</strong> ${tesserinoInfo}
                            </div>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 0.25rem; align-items: stretch; min-width: 120px;">
                            ${hasTesserino ? 
                                `<button class="btn-success btn-small copy-qr-person-btn" data-qr="${p.tesserino_qr}" style="margin: 0; font-size: 0.75rem; padding: 0.375rem 0.5rem;">
                                    📋 Copia QR
                                </button>` :
                                `<button class="btn-primary create-tesserino-person-btn" data-persona-id="${p.id}" data-persona-nome="${p.nome.replace(/"/g, '&quot;')}" style="margin: 0; font-size: 0.75rem; padding: 0.375rem 0.5rem; background: #007aff;">
                                    ➕ Crea Tesserino
                                </button>`
                            }
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
    
    container.innerHTML = listHtml;
    
    // Setup event listeners for the buttons
    setupPersoneListEventListeners(container);
}

// Setup event listeners for person list buttons
function setupPersoneListEventListeners(container) {
    // Copy QR buttons
    const copyButtons = container.querySelectorAll('.copy-qr-person-btn');
    copyButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const qrText = button.dataset.qr;
            copyTesserinoQR(qrText);
        });
    });
    
    // Create tesserino buttons
    const createButtons = container.querySelectorAll('.create-tesserino-person-btn');
    createButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const personaId = button.dataset.personaId;
            const personaNome = button.dataset.personaNome;
            createTesserinoForPerson(personaId, personaNome);
        });
    });
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
            operatore: currentUser.name
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
            operatore: currentUser.name
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
        residenza: document.getElementById('residenzaPersona').value.trim() || null,
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
            operatore: currentUser.name
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
        const response = await fetch(endpoint, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Errore durante l\'import');
        }
        
        let message = `✅ Import completato: ${result.importate || result.importati} record importati`;
        
        if (result.errori && result.errori.length > 0) {
            message += `\n\n⚠️ Errori (${result.errori.length}):\n${result.errori.slice(0, 5).join('\n')}`;
            if (result.errori.length > 5) {
                message += `\n... e altri ${result.errori.length - 5} errori`;
            }
        }
        
        showAlert(message, result.errori?.length ? 'info' : 'success', resultContainer);
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
    
    // Set default dates
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    const defaultDate = nextYear.toISOString().slice(0, 10);
    
    document.getElementById('expDateCrea').value = defaultDate;
    document.getElementById('expDateNuovaPersona').value = defaultDate;
}
