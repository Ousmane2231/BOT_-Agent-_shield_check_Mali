import express from 'express'
import { default as makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys'
import { createClient } from '@supabase/supabase-js'
import Groq from 'groq-sdk'
import axios from 'axios'
import pino from 'pino'
import 'dotenv/config'

const app = express()
const PORT = process.env.PORT || 3000
app.get('/', (req, res) => res.send('🛡️ SHIELDCHECK MALI BOT EN LIGNE 24/24'))
app.listen(PORT, () => console.log(`Serveur OK sur port ${PORT}`))

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
const URGENCE = '+223 66 51 84 01'
const CHAINE = 'https://whatsapp.com/channel/0029VbD1Jvt9mrGexwrvub3j'

// FONCTION GROQ IA
async function askGroq(question) {
    try {
        const completion = await groq.chat.completions.create({
            model: "llama-3.1-8b-instant",
            messages: [
                {
                    role: "system",
                    content: `Tu es ShieldCheck Mali, l'agent IA officiel. Tu parles comme un frère/une sœur malienne, sympa et pro.
                    RÈGLES: 1. Réponds à TOUTE question. 2. Explique RISQUES: 'Beaucoup vont en prison pour recel. Vérifie d'abord.'
                    3. Explique AVANTAGES: 'Enregistré = On peut BLOQUER, VEROUILLER, LOCALISER si volé.'
                    4. INSCRIPTION: 'Uniquement en boutique partenaire. Va sur la chaîne pour la liste.'
                    5. PROCÉDURE VOL: '1. Commissariat 2. Appeler ${URGENCE}'
                    6. Toujours donner ${URGENCE} et inviter sur la chaîne. Réponses courtes, max 3 lignes, 1 emoji.`
                },
                { role: "user", content: question }
            ],
            max_tokens: 200
        })
        return completion.choices[0].message.content
    } catch(e) {
        return `Je suis occupé. Appelez ${URGENCE} pour urgence 🛡️`
    }
}

// FONCTION ACTU MALI
async function getActuMali() {
    try {
        const prompt = "Donne moi 3 actus importantes du Mali aujourd'hui en 3 phrases courtes"
        const res = await askGroq(prompt)
        return `📰 *ACTUS DU MALI DU JOUR*\n\n${res}\n\nSource: IA ShieldCheck`
    } catch(e) {
        return `Impossible de charger les actus. Appelez ${URGENCE}`
    }
}

async function startBot(){
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info')
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', (u) => {
        const { connection, lastDisconnect } = u
        if(connection === 'open') console.log('🛡️ BOT SHIELDCHECK CONNECTÉ 24/24')
        if(connection === 'close'){
            const shouldReconnect = lastDisconnect.error?.output?.statusCode!== DisconnectReason.loggedOut
            if(shouldReconnect) startBot()
        }
    })

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0]
        if(!msg.message || msg.key.fromMe) return

        const from = msg.key.remoteJid
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim()
        const lowerText = text.toLowerCase()

        // RÈGLE 0: ACCUEIL
        if(lowerText === 'salut' || lowerText === 'menu' || lowerText === 'bonjour'){
            return sock.sendMessage(from, {
                text: `🛡️ *BIENVENUE CHEZ SHIELDCHECK MALI*\nJe suis votre assistant anti-vol 24/24.\n\n*Tapez:*\n1. *IMEI* ou *Châssis* pour vérifier\n2. *INSCRIRE* pour les boutiques\n3. *VOLÉ* en cas de vol\n4. *ACTU* pour les news du Mali\n\n*Urgence N°1:* ${URGENCE}`
            })
        }

        // RÈGLE 1: VÉRIFICATION IMEI / CHÂSSIS 15 CHIFFRES
        if(/^\d{15}$/.test(text)){
            const identifiant = text
            // Vérifier dans les 2 tables vol
            const { data: vol1 } = await supabase.from('objets_voles').select('*').eq('identifiant', identifiant).single()
            const { data: vol2 } = await supabase.from('objets_voles_reel').select('*').eq('identifiant', identifiant).single()
            const vole = vol1 || vol2

            if(vole && vole.statut === 'volé'){
                return sock.sendMessage(from, {
                    text: `🚨 *ALERTE SHIELDCHECK*\n\nCet ${vole.marque_modele} est signalé *VOLÉ* au Commissariat ${vole.commissariat_source}.\nATTENTION: Acheter un objet volé = Prison.\n*NE L'ACHÈTE PAS.*\n\n*Urgence N°1:* ${URGENCE}\n*Chaîne boutiques:* ${CHAINE}`
                })
            }

            // Vérifier si enregistré
            const { data: enregistre } = await supabase.from('registre_ventes').select('*').eq('identifiant', identifiant).single()
            if(enregistre){
                return sock.sendMessage(from, {
                    text: `✅ *APPAREIL SÉCURISÉ*\n\nCet ${enregistre.type_objet} est enregistré chez ShieldCheck au nom de *${enregistre.nom_client}* Tel: ${enregistre.telephone_client}.\nCode: ${enregistre.code_certification}\n\nSi volé: on peut le BLOQUER, VEROUILLER et LOCALISER.\n*Urgence:* ${URGENCE}`
                })
            }

            // Si propre
            return sock.sendMessage(from, {
                text: `✅ *CET IDENTIFIANT EST PROPRE*\nAucun signalement de vol.\n\n🛡️ *SHIELDCHECK MALI* sécurise ton bien.\nAVANTAGE: Si volé et enregistré, on peut le BLOQUER, VEROUILLER et LOCALISER.\n\n*COMMENT S'INSCRIRE?*\nRendez-vous boutique partenaire certifiée.\n*TARIFS:* Téléphone 2000 CFA | Moto 5000 CFA\n*Liste:* ${CHAINE}\n*Urgence:* ${URGENCE}`
            })
        }

        // RÈGLE 2: INSCRIRE / BOUTIQUE
        if(lowerText.includes('inscrire') || lowerText.includes('boutique')){
            return sock.sendMessage(from, {
                text: `📝 *INSCRIPTION SHIELDCHECK*\n\nPour vous inscrire, rendez-vous dans une *boutique partenaire certifiée* 🛡️\n\n*TARIFS:* Téléphone 2000 CFA | Moto 5000 CFA\nVous recevrez un *Code de Certification*.\n\n*Retrouvez la liste sur notre chaîne:*\n${CHAINE}\n\n*En cas de vol:* Appelez ${URGENCE}`
            })
        }

        // RÈGLE 3: VOLÉ
        if(lowerText.includes('volé')){
            return sock.sendMessage(from, {
                text: `😔 *OH NON FRÈRE*\n\n1. Déclarez d'abord au *commissariat* ou police.\n2. Appelez *IMMÉDIATEMENT* ${URGENCE}.\n3. Envoyez-moi l'IMEI/Châssis ici.\n\nNous allons *BLOQUER* et *LOCALISER* l'appareil.`
            })
        }

        // RÈGLE 4: ACTU
        if(lowerText === 'actu'){
            const actu = await getActuMali()
            return sock.sendMessage(from, { text: actu })
        }

        // RÈGLE 5: TOUTE AUTRE QUESTION = GROQ
        const reponseIA = await askGroq(text)
        return sock.sendMessage(from, { text: reponseIA + `\n\n*Urgence:* ${URGENCE}` })

    })
}
startBot()
