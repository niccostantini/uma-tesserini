#!/usr/bin/env node

const fetch = require('node-fetch');
const BASE_URL = 'http://localhost:5173';

async function testTesseraManagement() {
    console.log('🧪 Testing tessera management functionality...\n');
    
    try {
        // 1. Get a tessera ID from database
        console.log('1. Getting tessera information...');
        const tesseraId = '94f6f832-1c5d-4b10-b8f6-123456789012';
        
        const tesseraResponse = await fetch(`${BASE_URL}/tessere/${tesseraId}`);
        const tesseraData = await tesseraResponse.json();
        
        if (tesseraResponse.ok) {
            console.log(`✅ Tessera trovata: ${tesseraData.tessera.nome} (${tesseraData.tessera.stato})`);
            console.log(`   Persona ID: ${tesseraData.tessera.persona_id}`);
        } else {
            console.log(`❌ Errore: ${tesseraData.error}`);
            return;
        }
        
        console.log('\n2. Testing revoca endpoint...');
        
        // 2. Test revoca endpoint (only if tessera is active)
        if (tesseraData.tessera.stato === 'attivo') {
            const revocaResponse = await fetch(`${BASE_URL}/tessere/${tesseraId}/revoca`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    motivo: 'Test revoca automatico',
                    operatore: 'Test System'
                })
            });
            
            const revocaData = await revocaResponse.json();
            
            if (revocaResponse.ok) {
                console.log('✅ Tessera revocata con successo');
            } else {
                console.log(`❌ Errore revoca: ${revocaData.error}`);
            }
        } else {
            console.log('ℹ️ Tessera non attiva, skip revoca test');
        }
        
        console.log('\n3. Testing nuovo tesserino endpoint...');
        
        // 3. Test creating new tessera for same person
        const personaId = tesseraData.tessera.persona_id;
        const expDate = new Date();
        expDate.setFullYear(expDate.getFullYear() + 1);
        
        const nuovoResponse = await fetch(`${BASE_URL}/tessere/nuovo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                persona_id: personaId,
                operatore: 'Test System',
                exp_date: expDate.toISOString().slice(0, 10)
            })
        });
        
        const nuovoData = await nuovoResponse.json();
        
        if (nuovoResponse.ok) {
            console.log('✅ Nuovo tesserino creato con successo');
            console.log(`   ID: ${nuovoData.tesserino.id}`);
            console.log(`   QR: ${nuovoData.tesserino.qr_text.substring(0, 50)}...`);
        } else {
            console.log(`❌ Errore creazione: ${nuovoData.error}`);
        }
        
        console.log('\n4. Testing QR verification...');
        
        // 4. Test QR verification with new tessera
        if (nuovoResponse.ok) {
            const qrResponse = await fetch(`${BASE_URL}/qr/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    qr: nuovoData.tesserino.qr_text
                })
            });
            
            const qrData = await qrResponse.json();
            
            if (qrResponse.ok) {
                console.log('✅ QR verificato con successo');
                console.log(`   ID tessera: ${qrData.id}`);
            } else {
                console.log(`❌ Errore verifica QR: ${qrData.error}`);
            }
        }
        
        console.log('\n🎉 Test completato!');
        
    } catch (error) {
        console.error('❌ Errore durante il test:', error.message);
    }
}

// Verifica che il server sia in esecuzione
async function checkServer() {
    try {
        const response = await fetch(`${BASE_URL}/health`);
        return response.ok;
    } catch {
        return false;
    }
}

async function main() {
    console.log('🔍 Checking server status...');
    
    const serverRunning = await checkServer();
    if (!serverRunning) {
        console.log('❌ Server non in esecuzione. Avvia prima "npm start"');
        process.exit(1);
    }
    
    console.log('✅ Server online\n');
    await testTesseraManagement();
}

if (require.main === module) {
    main();
}
