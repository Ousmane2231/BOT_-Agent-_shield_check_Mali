require('dotenv').config();
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const http = require('http');

const PORT = process.env.PORT || 8080;
const OWNER = process.env.OWNER_NUMBER || "22382496985";
const DB_FILE = './db.json';

// BASE DE DONNÉES LOCALE SIMPLE
let db = { voles: [], enregistres: [] };
if(fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE));
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

console.log('🛡️ SHIELDCHECK MALI DEMARRE...');

const startBot = async () => {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true, // AFFICHE LE QR
        browser: ['ShieldCheck Mali', 'Chrome', '1.0.0']
    });
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, qr, lastDisconnect } = update;

        if(qr){
            console.log('\n====================================');
            console.log('SCAN CE QR CODE AVEC WHATSAPP');
            console.log('WhatsApp > 3 points > Appareils connectés > Associer un appareil');
            console.log('====================================\n');
            qrcode.generate(qr, {small: true});
        }

        if(connection === 'open') {
            console.log('✅ BOT CONNECTÉ 24/24');
            await sock.sendMessage(OWNER + '@s.whatsapp.net', { text: '🛡️ SHIELDCHECK MALI EN LIGNE' });
        }

        if(connection === 'close'){
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode!== DisconnectReason.loggedOut;
            if(shouldReconnect) setTimeout(startBot, 5000);
        }
    });

    // TOUTES LES RÈGLES DU BOT
    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if(!msg.message || msg.key.fromMe) return;
        const from = msg.key.remoteJid;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();

        // RÈGLE 0: ACCUEIL
        if(text.toLowerCase() === 'salut' || text.toLowerCase() === 'menu'){
            const accueil = `Bienvenue chez *SHIELDCHECK MALI* 🛡️\nJe suis votre assistant anti-vol 24/24.\n\n`+
            `Tapez:\n*1.* IMEI ou Châssis pour vérifier\n*2.* INSCRIRE pour les boutiques\n*3.* VOLÉ en cas de vol\n`+
            `Urgence: 66 51 84 01`;
            return sock.sendMessage(from, { text: accueil });
        }

        // RÈGLE 1: VÉRIFICATION IMEI / CHASSIS
        if(/^[0-9]{15}$/.test(text) || /^[A-Z0-9]{17}$/i.test(text)){
            const identifiant = text.toUpperCase();
            const type_objet = /^[0-9]{15}$/.test(text)? 'Téléphone' : 'Moto';

            const vole = db.voles.find(v => v.identifiant === identifiant);
            if(vole){
                return sock.sendMessage(from, { text: `🚨 *ALERTE: OBJET SIGNALÉ VOLÉ* 🚨\nObjet: ${vole.marque}\nCommissariat: ${vole.comm}\nNE L'ACHÈTE PAS.\nUrgence: 66 51 84 01` });
            }

            const enregistre = db.enregistres.find(e => e.identifiant === identifiant);
            if(enregistre){
                return sock.sendMessage(from, { text: `✅ *APPAREIL SÉCURISÉ* ✅\n${enregistre.type} enregistré au nom de ${enregistre.nom}\nTel: ${enregistre.tel}\nUrgence: 66 51 84 01` });
            }

            return sock.sendMessage(from, { text: `✅ *IDENTIFIANT PROPRE* ✅\nAucun signalement.\n\n🛡️ Pour sécuriser: Rendez-vous en boutique partenaire.\nTARIFS: Téléphone 2000 CFA | Moto 5000 CFA\nChaîne: https://whatsapp.com/channel/0029VbD1Jvt9mrGexwrvub3j\nUrgence: 66 51 84 01` });
        }

        // RÈGLE 2: INSCRIRE
        if(text.toLowerCase().includes('inscrire') || text.toLowerCase().includes('boutique')){
            return sock.sendMessage(from, { text: `Pour vous inscrire, rendez-vous dans une boutique partenaire certifiée ShieldCheck 🛡️\nTARIFS: Téléphone 2000 CFA | Moto 5000 CFA\nListe: https://whatsapp.com/channel/0029VbD1Jvt9mrGexwrvub3j\nEn cas de vol: Appelez 66 51 84 01` });
        }

        // RÈGLE 3: VOLÉ
        if(text.toLowerCase().includes('volé')){
            return sock.sendMessage(from, { text: `Oh non frère 😔\n1. Déclarez d'abord au commissariat.\n2. Appelez IMMÉDIATEMENT 66 51 84 01.\n3. Envoyez-moi l'IMEI/Châssis ici.\nNous allons BLOQUER l'appareil.` });
        }

        // RÈGLE 4: COMMANDES ADMIN POUR TESTER
        if(from.includes(OWNER)){
            if(text.startsWith('addvolé ')){
                const [cmd, identifiant, marque, comm] = text.split(' ');
                db.voles.push({identifiant, marque, comm});
                saveDB();
                return sock.sendMessage(from, { text: `🚨 IMEI ${identifiant} ajouté à la liste des volés` });
            }
            if(text.startsWith('addenreg ')){
                const [cmd, identifiant, type, nom, tel] = text.split(' ');
                db.enregistres.push({identifiant, type, nom, tel});
                saveDB();
                return sock.sendMessage(from, { text: `✅ ${type} ${identifiant} enregistré au nom de ${nom}` });
            }
        }

        // RÈGLE 5: PAR DÉFAUT
        return sock.sendMessage(from, { text: `Je n'ai pas compris mon frère.\nTapez: IMEI, INSCRIRE, VOLÉ, MENU\nUrgence: 66 51 84 01` });
    });
}

startBot();

// SERVEUR POUR RAILWAY
http.createServer((req,res)=>res.end('SHIELDCHECK OK')).listen(PORT, ()=>console.log('Serveur OK sur port '+PORT));
