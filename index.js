import {
    DisconnectReason,
    makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import readline from 'readline';
import { exec } from 'child_process';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { handleIncomingMessages, autoViewStatus, handleGroupLinks, handleWelcomeMessage , handleBotMenu } from './features.js';

// 🔥 টার্মিনাল ইনপুট নেওয়ার জন্য ফাংশন
function createReadlineInterface() {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
}

// 🔥 নম্বর ইনপুট ফাংশন (সব দেশের নম্বর সাপোর্ট করবে)
async function getPhoneNumber() {
    const rl = createReadlineInterface();
    const question = (query) => new Promise(resolve => rl.question(query, resolve));

    let phoneNumber;
    while (true) {
        phoneNumber = await question('📌 Enter your WhatsApp number with country code (e.g., +8801xxxxxxxxx): ');
        phoneNumber = phoneNumber.replace(/[^0-9]/g, ''); // শুধু ডিজিট রাখবে
        
        if (phoneNumber.length > 6) { // ৬ ডিজিটের বেশি হলেই গ্রহণ করবে
            break;
        }
        
        console.log(chalk.redBright('❌ Invalid number! Please enter a valid phone number with country code.'));
    }
    
    rl.close();
    return phoneNumber;
}

// 🔥 WhatsApp বট কানেক্ট করার ফাংশন
async function connectToWhatsApp() {
    const authFolderPath = 'auth_info_baileys';
    const credsFilePath = path.join(authFolderPath, 'creds.json');

    // 🔍 আগের authentication আছে কিনা চেক করা
    if (fs.existsSync(credsFilePath)) {
        console.log(chalk.greenBright('✅ Found previous authentication! Trying to auto-connect...'));
    } else {
        console.log(chalk.yellowBright('⚠️ No authentication found! Need to input number for pairing.'));
    }

    // 🔥 Baileys authentication state তৈরি করা
    const { state, saveCreds } = await useMultiFileAuthState(authFolderPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        printQRInTerminal: false, // ❌ QR কোড একদম বন্ধ
        auth: state
    });

    await handleIncomingMessages(sock);
await autoViewStatus(sock);
await handleGroupLinks(sock);
await handleWelcomeMessage(sock);
await handleBotMenu(sock); // ✅ `.bot` কমান্ড চালু করা হলো

    // 🛑 আগের authentication না থাকলে নতুন নম্বর ইনপুট লাগবে
    if (!fs.existsSync(credsFilePath)) {
        const phoneNumber = await getPhoneNumber();
        console.log(chalk.yellowBright('🔄 Requesting pairing code...'));
        
        try {
            let pairingCode = await sock.requestPairingCode(phoneNumber);
            console.log(chalk.greenBright(`✅ Pairing Code: ${pairingCode}`));
        } catch (error) {
            console.log(chalk.redBright('❌ Error requesting pairing code:', error.message));
        }
    }

    // 🔄 কানেকশন আপডেট হ্যান্ডলার
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('❌ Connection closed, reconnecting:', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            } else {
                console.log('🗑 Removing old authentication data...');
                exec(`rm -rf ${authFolderPath}`, () => process.exit(0));
            }
        } else if (connection === 'open') {
            console.log(chalk.greenBright('✅ Successfully connected to WhatsApp!'));
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

connectToWhatsApp();