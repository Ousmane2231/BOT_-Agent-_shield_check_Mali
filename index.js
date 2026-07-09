require('dotenv').config();
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { createClient } = require('@supabase/supabase-js');
const Groq = require('groq-sdk');
const axios = require('axios');
const http = require('http');

const PORT = process.env.PORT || 8080;
const OWNER = process.env.OWNER_NUMBER;

// CONNEXION SUPABASE
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// CONNEXION GROQ IA
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// INFOS DU PROJET
const INFO = {
    urgence: '66 51 84 01',
    autres: '93 72 84 21 / 76 11 92 77 / 76 98 63 64',
    chaine: 'https://whatsapp.com/channel/0029VbD1Jvt9mrGexwrvub3j',
    fondateur: 'Sangaré Ousmane',
    siege: 'Kalabankoro Tiebani, Bamako'
}

console.log('🛡️ SHIELDCHECK MALI DEMARRE...');

const startBot = async () => {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // On utilise le code de pairing
        browser: ['ShieldCheck Mali', 'Chrome', '3.0.0']
    });
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if(connection === 'open') {
            console.log('✅ BOT CONNECTÉ 24/24');
            await sock.sendMessage(OWNER + '@s.whatsapp.net', { text: '🛡️ SHIELDCHECK MALI EN LIGNE' });
        }
        // AFFICHER LE CODE DE CONNEXION
        if(!state.creds.registered){
            const code = await sock.requestPairingCode(OWNER);
            console.log(`\n🔥 TON CODE DE CONNEXION : ${code} 🔥\n`);
        }
        if(connection === 'close'){
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode!== DisconnectReason.loggedOut;
            if(shouldReconnect) setTimeout(startBot, 5000);
        }
    });

    // LOGIQUE PRINCIPALE DU BOT
    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if(!msg.message || msg.key.fromMe) return;
        const from = msg.key.remoteJid;
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const lowerText = text.toLowerCase();

        // RÈGLE 0: ACCUEIL
        if(lowerText === 'salut' || lowerText === 'menu'){
            const accueil = `Bienvenue chez *SHIELDCHECK MALI* 🛡️\nJe suis votre assistant anti-vol 24/24.\n\n`+
            `Tapez:\n*1.* IMEI ou Châssis pour vérifier\n*2.* INSCRIRE pour les boutiques\n*3.* VOLÉ en cas de vol\n`+
            `Urgence: ${INFO.urgence}`;
            return sock.sendMessage(from, { text: accueil });
        }

        // RÈGLE 1: VÉRIFICATION IMEI / CHASSIS = 15 CHIFFRES OU 17 CARACTERES
        if(/^[0-9]{15}$/.test(text) || /^[A-Z0-9]{17}$/i.test(text)){
            const identifiant = text.toUpperCase();
            const type_objet = /^[0-9]{15}$/.test(text)? 'Téléphone' : 'Moto';

            // 1. Vérifier dans objets_voles
            let { data: vole1 } = await supabase.from('objets_voles').select('*').eq('identifiant', identifiant).single();
            let { data: vole2 } = await supabase.from('objets_voles_reel').select('*').eq('identifiant', identifiant).single();
            const vole = vole1 || vole2;

            if(vole){
                const reponse = `🚨 *ALERTE SHIELDCHECK: OBJET SIGNALÉ VOLÉ* 🚨\n`+
                `Objet: ${vole.marque_modele}\nCommissariat: ${vole.commissariat_source}\nVictime: ${vole.nom_victime}\n\n`+
                `ATTENTION: Acheter un objet volé = Prison.\nNE L'ACHÈTE PAS.\n\n`+
                `Urgence N°1: ${INFO.urgence}\nChaîne boutiques: ${INFO.chaine}`;
                return sock.sendMessage(from, { text: reponse });
            }

            // 2. Vérifier si enregistré dans registre_ventes
            let { data: enregistre } = await supabase.from('registre_ventes').select('*').eq('identifiant', identifiant).single();
            if(enregistre){
                const reponse = `✅ *APPAREIL SÉCURISÉ* ✅\n`+
                `Cet ${enregistre.type_objet} est enregistré chez ShieldCheck\n`+
                `Nom: ${enregistre.nom_client}\nTel: ${enregistre.telephone_client}\n`+
                `Code Certif: ${enregistre.code_certification}\n\n`+
                `Urgence: ${INFO.urgence}`;
                return sock.sendMessage(from, { text: reponse });
            }

            // 3. Si PROPRE
            const reponse = `✅ *IDENTIFIANT PROPRE* ✅\nAucun signalement.\n\n`+
            `🛡️ SHIELDCHECK MALI sécurise ton bien.\nAVANTAGE: Si volé et enregistré, on peut le BLOQUER, VEROUILLER et LOCALISER.\n\n`+
            `COMMENT S'INSCRIRE?\nRendez-vous dans une boutique partenaire certifiée.\n`+
            `TARIFS: Téléphone 2000 CFA | Moto 5000 CFA\n`+
            `Liste: ${INFO.chaine}\nUrgence: ${INFO.urgence}`;
            return sock.sendMessage(from, { text: reponse });
        }

        // RÈGLE 2: INSCRIRE / BOUTIQUE
        if(lowerText.includes('inscrire') || lowerText.includes('boutique')){
            const reponse = `Pour vous inscrire, rendez-vous dans une boutique partenaire certifiée ShieldCheck 🛡️\n`+
            `TARIFS: Téléphone 2000 CFA | Moto 5000 CFA\n`+
            `Vous recevrez un Code de Certification.\n`+
            `Retrouvez la liste sur notre chaîne:\n${INFO.chaine}\n`+
            `En cas de vol: Appelez ${INFO.urgence}`;
            return sock.sendMessage(from, { text: reponse });
        }

        // RÈGLE 3: VOLÉ
        if(lowerText.includes('volé')){
            const reponse = `Oh non frère 😔\n`+
            `1. Déclarez d'abord au commissariat ou police.\n`+
            `2. Appelez IMMÉDIATEMENT ${INFO.urgence}.\n`+
            `3. Envoyez-moi l'IMEI/Châssis.\n`+
            `Nous allons BLOQUER et LOCALISER l'appareil.`;
            return sock.sendMessage(from, { text: reponse });
        }

        // RÈGLE 4: ACTU
        if(lowerText.includes('actu')){
            try {
                const completion = await groq.chat.completions.create({
                    messages: [{ role: "user", content: "Donne moi 3 actualités du Mali d'aujourd'hui. Court et en français." }],
                    model: "llama-3.1-8b-instant", // Modèle actuel
                });
                const actu = completion.choices[0]?.message?.content || "Pas d'actu pour le moment.";
                return sock.sendMessage(from, { text: `📰 *ACTU MALI DU JOUR*\n\n${actu}` });
            } catch(e) {
                return sock.sendMessage(from, { text: "Erreur pour charger les actus." });
            }
        }

        // RÈGLE 5: TOUTE AUTRE QUESTION = GROQ EST LE CERVEAU
        try {
            const completion = await groq.chat.completions.create({
                messages: [
                    { role: "system", content: `Tu es ShieldCheck Mali, l'agent IA officiel. Tu parles comme un frère/une sœur malienne, sympa et pro.
                    TA MISSION: Répondre à TOUTE question. Expliquer les RISQUES: Beaucoup vont en prison pour recel. Vérifie d'abord.
                    Expliquer AVANTAGES: Enregistré = On peut BLOQUER, VEROUILLER, LOCALISER si volé.
                    Expliquer INSCRIPTION: Uniquement en boutique partenaire. Va sur la chaîne pour la liste.
                    Toujours donner le ${INFO.urgence} en premier et inviter sur la chaîne. Réponses courtes, max 3 lignes, 1 emoji.` },
                    { role: "user", content: text }
                ],
                model: "llama-3.1-8b-instant",
            });
            const reponseIA = completion.choices[0]?.message?.content;
            return sock.sendMessage(from, { text: reponseIA });
        } catch(e) {
            // RÈGLE 6: SI LE BOT NE COMPREND PAS
            const erreur = `Je n'ai pas compris mon frère.\n`+
            `Tapez: IMEI, INSCRIRE, VOLÉ, ACTU ou BOUTIQUE\n`+
            `Urgence: ${INFO.urgence}`;
            return sock.sendMessage(from, { text: erreur });
        }
    });
}

startBot();

// SERVEUR POUR RAILWAY
http.createServer((req,res)=>res.end('SHIELDCHECK OK')).listen(PORT, ()=>console.log('Serveur OK sur port '+PORT));
