require('dotenv').config();
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { createClient } = require('@supabase/supabase-js');
const Groq = require('groq-sdk');
const qrcode = require('qrcode-terminal');
const http = require('http');

const PORT = process.env.PORT || 8080;
const OWNER = process.env.OWNER_NUMBER; // 22382496985

// CONNEXIONS
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// INFOS PROJET
const INFO = {
    urgence: '66 51 84 01',
    autres: '93 72 84 21 / 76 11 92 77 / 76 98 63 64',
    chaine: 'https://whatsapp.com/channel/0029VbD1Jvt9mrGexwrvub3j',
    fondateur: 'Sangaré Ousmane',
    siege: 'Kalabankoro Tiebani, Bamako'
}

console.log('🛡️ SHIELDCHECK MALI V3.1 DEMARRE...');

let sock; // global pour reconnexion

const startBot = async () => {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false, // on gère nous même
        browser: ['ShieldCheck Mali', 'Chrome', '3.0.0'],
        connectTimeoutMs: 60000
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, qr, lastDisconnect } = update;

        // 1. AFFICHER QR EN BOUCLE JUSQU'AU SCAN
        if(qr){
            console.log('\n========== SCANNE CE QR CODE AVANT 20s ==========');
            qrcode.generate(qr, {small: true});
            console.log('WhatsApp > 3 points > Appareils connectés > Associer un appareil');
            console.log('================================================\n');
        }

        if(connection === 'open') {
            console.log('✅ BOT SHIELDCHECK CONNECTÉ 24/24');
            await sock.sendMessage(OWNER + '@s.whatsapp.net', { text: '🛡️ SHIELDCHECK MALI EN LIGNE' });
        }

        // 2. RECONNEXION AUTO SI ÇA COUPE
        if(connection === 'close'){
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode!== DisconnectReason.loggedOut;
            console.log('Connexion fermée. Reconnexion dans 5s...', lastDisconnect.error?.message);
            if(shouldReconnect) setTimeout(startBot, 5000);
        }
    });

    // LOGIQUE PRINCIPALE - TON CODE
    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if(!msg.message || msg.key.fromMe) return;
        const from = msg.key.remoteJid;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const lowerText = text.toLowerCase();

        // RÈGLE 0: ACCUEIL
        if(lowerText === 'salut' || lowerText === 'menu' || lowerText === '1'){
            const accueil = `Bienvenue chez *SHIELDCHECK MALI* 🛡️\nJe suis votre assistant anti-vol 24/24.\n\n`+
            `Tapez:\n*1.* IMEI ou Châssis pour vérifier\n*2.* INSCRIRE pour les boutiques\n*3.* VOLÉ en cas de vol\n*4.* ACTU\n`+
            `Urgence: ${INFO.urgence}`;
            return sock.sendMessage(from, { text: accueil });
        }

        // RÈGLE 1: VÉRIFICATION IMEI / CHASSIS
        if(/^[0-9]{15}$/.test(text) || /^[A-Z0-9]{17}$/i.test(text)){
            const identifiant = text.toUpperCase();
            const type_objet = /^[0-9]{15}$/.test(text)? 'Téléphone' : 'Moto';
            await sock.sendMessage(from, { text: '🔍 Vérification en cours...' });

            let { data: vole1 } = await supabase.from('objets_voles').select('*').eq('identifiant', identifiant).single();
            let { data: vole2 } = await supabase.from('objets_voles_reel').select('*').eq('identifiant', identifiant).single();
            const vole = vole1 || vole2;

            if(vole){
                const reponse = `🚨 *ALERTE SHIELDCHECK: OBJET SIGNALÉ VOLÉ* 🚨\n`+
                `Cet ${vole.marque_modele} est signalé VOLÉ au Commissariat ${vole.commissariat_source}.\n`+
                `ATTENTION: Acheter un objet volé = Prison. NE L'ACHÈTE PAS.\n\n`+
                `Urgence N°1: ${INFO.urgence}\nChaîne boutiques: ${INFO.chaine}`;
                return sock.sendMessage(from, { text: reponse });
            }

            let { data: enregistre } = await supabase.from('registre_ventes').select('*').eq('identifiant', identifiant).single();
            if(enregistre){
                const reponse = `✅ *APPAREIL SÉCURISÉ* ✅\n`+
                `Cet ${enregistre.type_objet} est enregistré chez ShieldCheck au nom de ${enregistre.nom_client}\n`+
                `Tel: ${enregistre.telephone_client}. Appareil sécurisé.\n\n`+
                `Urgence: ${INFO.urgence}`;
                return sock.sendMessage(from, { text: reponse });
            }

            const reponse = `✅ *IDENTIFIANT PROPRE* ✅\nAucun signalement.\n\n`+
            `🛡️ SHIELDCHECK MALI sécurise ton bien.\nAVANTAGE: Si volé et enregistré, on peut le BLOQUER, VEROUILLER et LOCALISER.\n\n`+
            `COMMENT S'INSCRIRE?\nRendez-vous dans une boutique partenaire certifiée.\n`+
            `TARIFS: Téléphone 2000 CFA | Moto 5000 CFA\n`+
            `Liste des boutiques: ${INFO.chaine}\nUrgence: ${INFO.urgence}`;
            return sock.sendMessage(from, { text: reponse });
        }

        // RÈGLE 2: INSCRIRE / BOUTIQUE
        if(lowerText.includes('inscrire') || lowerText.includes('boutique') || lowerText === '2'){
            const reponse = `Pour vous inscrire, rendez-vous dans une boutique partenaire certifiée ShieldCheck 🛡️\n`+
            `TARIFS: Téléphone 2000 CFA | Moto 5000 CFA\n`+
            `Vous recevrez un Code de Certification.\n`+
            `Retrouvez la liste sur notre chaîne:\n${INFO.chaine}\n`+
            `En cas de vol: Appelez ${INFO.urgence}`;
            return sock.sendMessage(from, { text: reponse });
        }

        // RÈGLE 3: VOLÉ
        if(lowerText.includes('volé') || lowerText === '3'){
            const reponse = `Oh non frère 😔\n`+
            `1. Déclarez d'abord au commissariat ou police.\n`+
            `2. Appelez IMMÉDIATEMENT ${INFO.urgence}.\n`+
            `3. Envoyez-moi l'IMEI/Châssis ici.\n`+
            `Nous allons BLOQUER et LOCALISER l'appareil.`;
            return sock.sendMessage(from, { text: reponse });
        }

        // RÈGLE 4: ACTU
        if(lowerText.includes('actu') || lowerText === '4'){
            try {
                const completion = await groq.chat.completions.create({
                    messages: [{ role: "user", content: "Donne 3 actualités du Mali d'aujourd'hui. Très court, 1 ligne par actu." }],
                    model: "llama-3.1-8b-instant",
                });
                const actu = completion.choices[0]?.message?.content || "Pas d'actu disponible.";
                return sock.sendMessage(from, { text: `📰 *ACTU MALI*\n\n${actu}` });
            } catch(e) {
                return sock.sendMessage(from, { text: "Erreur pour charger les actus." });
            }
        }

        // RÈGLE 5: IA GROQ
        try {
            const systemPrompt = `Tu es ShieldCheck Mali, l'agent IA officiel. Tu parles comme un frère/une sœur malienne, sympa et pro.
            TA MISSION: Répondre à ABSOLUMENT TOUTE question. Expliquer RISQUES, AVANTAGES, INSCRIPTION, PROCÉDURE VOL.
            Toujours donner le ${INFO.urgence} en premier et inviter sur la chaîne. Réponses courtes, max 3 lignes, 1 emoji.`;

            const completion = await groq.chat.completions.create({
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: text }
                ],
                model: "llama-3.1-8b-instant",
                max_tokens: 200
            });
            const reponseIA = completion.choices[0]?.message?.content;
            return sock.sendMessage(from, { text: reponseIA });
        } catch(e) {
            const erreur = `Je n'ai pas compris mon frère.\nTapez: IMEI, INSCRIRE, VOLÉ, ACTU ou BOUTIQUE\nUrgence: ${INFO.urgence}`;
            return sock.sendMessage(from, { text: erreur });
        }
    });
}

startBot();

// 3. SERVEUR POUR RAILWAY + PING TOUTES LES 5MIN POUR PAS QU'IL DORME
http.createServer((req,res)=>res.end('SHIELDCHECK OK')).listen(PORT, ()=>console.log('Serveur OK sur port '+PORT));
setInterval(() => {
    http.get(`http://localhost:${PORT}`)
}, 300000); // Ping toutes les 5 minutes
