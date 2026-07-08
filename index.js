import { default as makeWASocket, DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import qrcode from 'qrcode-terminal'
import Groq from 'groq-sdk'
import { createClient } from '@supabase/supabase-js'
import axios from 'axios'
import express from 'express'
import NodeCache from 'node-cache' // <-- AJOUTE ÇA

// SERVEUR WEB POUR GARDER RAILWAY EN VIE 24/24
const app = express()
const PORT = process.env.PORT || 3000
app.get('/', (req, res) => res.send('🛡️ SHIELDCHECK MALI BOT EN LIGNE'))
app.listen(PORT, () => console.log(`Serveur actif sur le port ${PORT}`))

// CONNEXION GROQ + SUPABASE
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)

// INFOS OFFICIELLES SHIELDCHECK MALI
const URGENCE = '+223 66 51 84 01'
const CHAINE = 'https://whatsapp.com/channel/0029VbD1Jvt9mrGexwrvub3j'

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info')
    const sock = makeWASocket({
        auth: state,
        browser: ['SHIELDCHECK MALI', 'Chrome', '1.0.0'],
        msgRetryCounterCache: new NodeCache() // <-- AJOUTE ÇA
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update

        // AFFICHAGE DU QR
        if (qr) {
            console.log('\n\n=================================')
            console.log('🛡️ SCANNE CE QR CODE POUR CONNECTER:')
            console.log('WhatsApp > Appareils connectés > Associer un appareil')
            console.log('=================================\n\n')
            qrcode.generate(qr, { small: true })
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode!== DisconnectReason.loggedOut
            console.log('Connexion coupée, reconnexion dans 3s...')
            if (shouldReconnect) setTimeout(startBot, 3000)
        }

        if (connection === 'open') {
            console.log('✅ SHIELDCHECK MALI CONNECTÉ 24/24')
        }
    })

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0]
        if (!msg.message || msg.key.fromMe) return

        const from = msg.key.remoteJid
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || ''
        const msgText = text.trim()

        // RÈGLE 0: ACCUEIL
        if (!msgText || msgText === '1' || msgText === 'salut') {
            return await sock.sendMessage(from, { text: `Bienvenue chez SHIELDCHECK MALI 🛡️\nJe suis votre assistant anti-vol 24/24.\n\nTapez:\n1. IMEI ou Châssis pour vérifier\n2. INSCRIRE pour les boutiques\n3. VOLÉ en cas de vol\n4. ACTU pour les actus\nUrgence: ${URGENCE}`})
        }

        // RÈGLE 1: VÉRIFIER IMEI/CHÂSSIS 15 CHIFFRES
        if (/^\d{15}$/.test(msgText)) {
            const identifiant = msgText
            const { data: vole1 } = await supabase.from('objets_voles').select('*').eq('identifiant', identifiant).eq('statut', 'vole').single()
            const { data: vole2 } = await supabase.from('objets_voles_reel').select('*').eq('identifiant', identifiant).eq('statut', 'vole').single()
            const vole = vole1 || vole2

            if (vole) {
                return await sock.sendMessage(from, { text: `🚨 ALERTE SHIELDCHECK: Cet ${vole.marque_modele} est signalé VOLÉ au Commissariat ${vole.commissariat_source}.\n\nATTENTION: Acheter un objet volé = Prison.\nNE L'ACHÈTE PAS.\n\nUrgence N°1: ${URGENCE}\nChaîne boutiques: ${CHAINE}`})
            }

            const { data: enregistre } = await supabase.from('registre_ventes').select('*').eq('identifiant', identifiant).single()
            if (enregistre) {
                return await sock.sendMessage(from, { text: `✅ Cet ${enregistre.type_objet} est enregistré chez ShieldCheck au nom de ${enregistre.nom_client} Tel: ${enregistre.telephone_client}.\n\nAppareil sécurisé. Si volé on peut le BLOQUER, VEROUILLER et LOCALISER.\n\nUrgence: ${URGENCE}`})
            }

            return await sock.sendMessage(from, { text: `✅ Cet identifiant est PROPRE. Aucun signalement.\n\n🛡️ SHIELDCHECK MALI sécurise ton bien.\nAVANTAGE: Si volé et enregistré, on peut le BLOQUER, VEROUILLER et LOCALISER.\n\nCOMMENT S'INSCRIRE?\nRendez-vous dans une boutique partenaire certifiée.\nTARIFS: Téléphone 2000 CFA | Moto 5000 CFA\nListe: ${CHAINE}\nUrgence: ${URGENCE}`})
        }

        // RÈGLE 2: INSCRIRE
        if (msgText.toLowerCase().includes('inscrire') || msgText.toLowerCase().includes('boutique')) {
            return await sock.sendMessage(from, { text: `Pour vous inscrire, rendez-vous dans une boutique partenaire certifiée ShieldCheck 🛡️\n\nTARIFS: Téléphone 2000 CFA | Moto 5000 CFA\nVous recevrez un Code de Certification.\n\nRetrouvez la liste sur notre chaîne:\n${CHAINE}\n\nEn cas de vol: Appelez ${URGENCE}`})
        }

        // RÈGLE 3: VOLÉ
        if (msgText.toLowerCase().includes('volé')) {
            return await sock.sendMessage(from, { text: `Oh non frère 😔\n\n1. Déclarez d'abord au commissariat ou police.\n2. Appelez IMMÉDIATEMENT ${URGENCE}.\n3. Envoyez-moi l'IMEI/Châssis.\n\nNous allons BLOQUER et LOCALISER l'appareil.`})
        }

        // RÈGLE 4: ACTU
        if (msgText.toLowerCase().includes('actu')) {
            return await sock.sendMessage(from, { text: `📰 ACTUS MALI DU JOUR:\n\n1. Campagne ShieldCheck de sensibilisation à Bamako\n2. Nouvelle boutique partenaire certifiée à Kalabankoro\n3. 10 appareils bloqués ce mois grâce à ShieldCheck\nUrgence: ${URGENCE}`})
        }

        // RÈGLE 5: GROQ POUR TOUT LE RESTE
        const systemPrompt = `Tu es ShieldCheck Mali, l'agent IA officiel. Tu parles comme un frère/une sœur malienne, sympa et pro. Réponds à TOUTE question. Expliquer RISQUES: 'Beaucoup vont en prison pour recel. Vérifie d'abord.' Expliquer AVANTAGES: 'Enregistré = BLOQUER, VEROUILLER, LOCALISER.' Expliquer INSCRIPTION: 'Uniquement en boutique partenaire.' PROCÉDURE VOL: '1. Commissariat 2. Appeler 66 51 84 01' Toujours donner 66 51 84 01. Réponses courtes, max 3 lignes, 1 emoji.`
        try {
            const aiResponse = await groq.chat.completions.create({
                messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: msgText }],
                model: 'llama-3.1-8b-instant',
                max_tokens: 200,
            })
            await sock.sendMessage(from, { text: aiResponse.choices[0].message.content })
        } catch (e) {
            await sock.sendMessage(from, { text: `Je n'ai pas compris mon frère.\nTapez: IMEI, INSCRIRE, VOLÉ, ACTU ou BOUTIQUE\nUrgence: ${URGENCE}`})
        }
    })
}
startBot()
