import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import chalk from 'chalk';
import fs from 'fs';

// ✅ Owner Number সেট করুন (শুধু নম্বর, @s.whatsapp.net নয়)
const OWNER_NUMBER = '919907298153';

// 🔥 ইনকামিং মেসেজ হ্যান্ডলারের জন্য ফাংশন
export async function handleIncomingMessages(sock) {
    sock.ev.on('messages.upsert', async (messageUpdate) => {
        const messages = messageUpdate.messages;

        for (const msg of messages) {
            const senderJid = msg.key.participant || msg.key.remoteJid;
            const senderNumber = senderJid.replace(/[@.a-z]/g, '');
            const groupId = msg.key.remoteJid;

            console.log(`📩 Message from: ${senderNumber}`);

            const messageContent = msg.message?.conversation || 
                                   msg.message?.extendedTextMessage?.text || 
                                   msg.message?.imageMessage?.caption || 
                                   msg.message?.videoMessage?.caption || 
                                   '';

            console.log(chalk.greenBright(`📩 Message Content: ${messageContent}`));
            
                        if (messageContent.toLowerCase() === ".bot") {
                const menuText = `🤖 *Bot Command List* 🤖\n\n` +
                                 `1️⃣ *.ping* - বট অনলাইনে আছে কিনা চেক করুন\n` +
                                 `2️⃣ *.help* - সহায়তা মেনু দেখুন\n` +
                                 `3️⃣ *.info* - বটের তথ্য পান\n\n` +
                                 `✅ আরো ফিচার আসছে...`;

                await sock.sendMessage(msg.key.remoteJid, { text: menuText }, { quoted: msg });
            }
            
            
            // ✅ `.vv` কমান্ড চেক করা (View Once মিডিয়া ডাউনলোড)
            if (messageContent === '.vv') {
                await handleViewOnceMedia(sock, msg, groupId);
            }

            // ✅ `.info` কমান্ড চেক করা (নম্বরের তথ্য বের করা)
            if (messageContent.startsWith('.info ')) {
                try {
                    const targetNumber = messageContent.split(' ')[1].replace(/[^0-9]/g, '') + '@s.whatsapp.net';

                    console.log(chalk.yellowBright(`🔍 Fetching info for ${targetNumber}...`));

                    const userInfo = await sock.onWhatsApp(targetNumber);
                    if (!userInfo.length) {
                        await sock.sendMessage(groupId, { text: '❌ এই নম্বর WhatsApp এ নেই!' });
                        return;
                    }

                    const profilePicUrl = await sock.profilePictureUrl(targetNumber, 'image').catch(() => null);
                    const userStatus = await sock.fetchStatus(targetNumber).catch(() => null);
                    const userName = userInfo[0].notify || '❌ নাম পাওয়া যায়নি';

                    let infoText = `📌 *User Info*\n\n`;
                    infoText += `👤 *Name:* ${userName}\n`;
                    infoText += `📜 *Bio:* ${userStatus?.status || '❌ বায়ো পাওয়া যায়নি'}\n`;
                    infoText += `📞 *Number:* ${messageContent.split(' ')[1]}\n`;

                    console.log(chalk.greenBright(`✅ Info fetched for ${targetNumber}`));

                    let messageOptions = { text: infoText };
                    if (profilePicUrl) {
                        messageOptions = {
                            image: { url: profilePicUrl },
                            caption: infoText
                        };
                    }

                    await sock.sendMessage(OWNER_NUMBER + '@s.whatsapp.net', messageOptions);
                    await sock.sendMessage(groupId, { text: '✅ তথ্য সংগ্রহ করে Owner-এ পাঠানো হয়েছে!' });
                } catch (error) {
                    console.error(chalk.red('❌ User info fetch করতে সমস্যা হয়েছে!'), error);
                    await sock.sendMessage(groupId, { text: '❌ তথ্য বের করা যায়নি!' });
                }
            }

            // ✅ `.tagall` কমান্ড চেক করা (গ্রুপে সব মেম্বার ট্যাগ)
            if (messageContent.toLowerCase().trim() === '.tagall' && groupId?.endsWith('@g.us')) {
                try {
                    console.log(chalk.yellowBright('🔍 Fetching group members...'));

                    const groupMetadata = await sock.groupMetadata(groupId);
                    const participants = groupMetadata.participants.map(p => p.id);

                    let tagMessage = `👥 **Group Members (${participants.length})**\n\n`;

                    participants.forEach((id, index) => {
                        tagMessage += `${index + 1}. @${id.split('@')[0]}\n`;
                    });

                    await sock.sendMessage(groupId, {
                        text: tagMessage,
                        mentions: participants
                    });

                    console.log(chalk.blueBright(`✅ Tagged ${participants.length} members in group ${groupId}`));
                } catch (error) {
                    console.error(chalk.red('❌ Error fetching group metadata:'), error);
                }
            }
        }
    });
}

// 🔥 অটো স্ট্যাটাস সিন ফাংশন (Auto View Status)
export async function autoViewStatus(sock) {
    sock.ev.on('messages.upsert', async (update) => {
        for (const msg of update.messages) {
            if (msg.key.remoteJid === 'status@broadcast') {
                try {
                    console.log(chalk.yellowBright(`👀 Viewing status from: ${msg.pushName || 'Unknown'}`));
                    await sock.readMessages([msg.key]);
                    console.log(chalk.greenBright(`✅ Status Seen!`));
                } catch (error) {
                    console.error(chalk.red('❌ Failed to view status!'), error);
                }
            }
        }
    });
}

export async function handleGroupLinks(sock) {
    sock.ev.on('messages.upsert', async (update) => {
        for (const msg of update.messages) {
            const groupId = msg.key.remoteJid;

            // ✅ শুধু গ্রুপের জন্য কাজ করবে
            if (!groupId.endsWith('@g.us')) continue;

            const senderJid = msg.key.participant;
            const senderNumber = senderJid.replace(/[@.a-z]/g, '');
            const messageContent = msg.message?.conversation || 
                                   msg.message?.extendedTextMessage?.text || 
                                   '';

            // ✅ গ্রুপ লিংক চেক করা
            const linkRegex = /(https?:\/\/[^\s]+)/;
            if (linkRegex.test(messageContent)) {
                try {
                    console.log(chalk.yellowBright(`🚨 Group link detected from ${senderNumber}`));

                    // ✅ গ্রুপ ইনফো আনতে হবে
                    const groupMetadata = await sock.groupMetadata(groupId);
                    const participants = groupMetadata.participants;
                    const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';

                    // ✅ বট এডমিন কিনা চেক করা
                    const botAdmin = participants.find(p => p.id === botJid)?.admin;
                    if (!botAdmin) {
                        console.log(chalk.red('❌ Bot is not an admin, cannot remove link sender.'));
                        return;
                    }

                    // ✅ মেসেজ মুছে ফেলা
                    await sock.sendMessage(groupId, {
                        delete: msg.key
                    });

                    // ✅ মেম্বার রিমুভ করা
                    await sock.groupParticipantsUpdate(groupId, [senderJid], 'remove');

                    console.log(chalk.greenBright(`✅ Removed ${senderNumber} for sharing a link.`));

                    // ✅ গ্রুপে নোটিফিকেশন পাঠানো
                    await sock.sendMessage(groupId, {
                        text: `🚫 *${senderNumber}* গ্রুপে লিংক শেয়ার করার কারণে রিমুভ করা হয়েছে!`
                    });

                } catch (error) {
                    console.error(chalk.red('❌ Failed to remove link sender!'), error);
                }
            }
        }
    });
}

// 🔥 গ্রুপে নতুন মেম্বার এলে স্টাইলিশ ওয়েলকাম ম্যাসেজ পাঠানোর ফাংশন
export async function handleWelcomeMessage(sock) {
    sock.ev.on('group-participants.update', async (update) => {
        const { id: groupId, participants, action } = update;

        if (action !== 'add') return; // ✅ শুধু নতুন জয়েন করা মেম্বারদের জন্য কাজ করবে

        try {
            console.log(chalk.yellowBright(`👋 New member joined: ${participants.join(', ')}`));

            // ✅ গ্রুপ ইনফো আনতে হবে
            const groupMetadata = await sock.groupMetadata(groupId);
            const groupName = groupMetadata.subject; // ✅ গ্রুপের নাম পাওয়া যাবে
            const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';

            // ✅ বট এডমিন কিনা চেক করা
            const botAdmin = groupMetadata.participants.find(p => p.id === botJid)?.admin;
            if (!botAdmin) {
                console.log(chalk.red('❌ Bot is not an admin, cannot send welcome message.'));
                return;
            }

            // ✅ নতুন মেম্বারদের নাম মেনশন করা
            const mentions = participants.map(id => `@${id.split('@')[0]}`).join(', ');

            // ✅ স্টাইলিশ ওয়েলকাম মেসেজ
            const welcomeMessage = `🌟 *হ্যালো ডিয়ার ফ্রেন্ড* ${mentions}!  
            
💞~*[𝐖𝐄𝐋𝐂𝐎𝐌𝐄 𝐓𝐎 ${groupName}]*💞  
   
🔹 **আপনার সুন্দর আগমনে আমরা আনন্দিত!**  
🔹 **দয়া করে গ্রুপের নিয়ম মেনে চলুন**  

📌 _Enjoy & Stay Connected!_ 😊`;

            // ✅ নতুন মেম্বারকে ওয়েলকাম জানানো
            await sock.sendMessage(groupId, {
                text: welcomeMessage,
                mentions: participants
            });

            console.log(chalk.greenBright(`✅ Welcome message sent successfully in ${groupName}!`));

        } catch (error) {
            console.error(chalk.red('❌ Welcome message sending failed!'), error);
        }
    });
}

// ✅ View Once মিডিয়া ডাউনলোড করার ফাংশন
export async function handleViewOnceMedia(sock, msg, groupId) {
    try {
        const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quotedMsg || (!quotedMsg.imageMessage && !quotedMsg.videoMessage)) {
            await sock.sendMessage(groupId, { text: '❌ প্লিজ শুধু ওয়ান টাইম ফটো বা ভিডিও তে .vv দিন!' });
            return;
        }

        console.log(chalk.yellowBright('🔍 Checking for View Once media...'));

        const mediaType = quotedMsg.imageMessage ? 'image' : 'video';
        const stream = await downloadContentFromMessage(quotedMsg[mediaType + 'Message'], mediaType);
        let buffer = Buffer.from([]);

        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        if (!buffer.length) {
            await sock.sendMessage(groupId, { text: '❌ মিডিয়া ডাউনলোড করা যাচ্ছে না!' });
            return;
        }

        const fileName = `view_once_${Date.now()}.${mediaType === 'image' ? 'jpg' : 'mp4'}`;
        fs.writeFileSync(fileName, buffer);

        // ✅ ডাউনলোড করা মিডিয়া OWNER_NUMBER-এ পাঠানো হবে
        await sock.sendMessage(OWNER_NUMBER + '@s.whatsapp.net', {
            [mediaType]: { url: fileName },
            caption: `🔓 *View Once মিডিয়া উদ্ধার করা হয়েছে!*`
        });

        fs.unlinkSync(fileName);
        console.log(chalk.greenBright(`✅ View Once মিডিয়া সফলভাবে ${OWNER_NUMBER} এ পাঠানো হয়েছে!`));
    } catch (error) {
        console.error(chalk.red('❌ View Once মিডিয়া ডাউনলোড করতে সমস্যা হয়েছে!'), error);
        await sock.sendMessage(groupId, { text: '❌ মিডিয়া রিকভারি ফেইলড!' });
    }
}

export async function handleBotMenu(sock) {
    sock.ev.on('messages.upsert', async (messageUpdate) => {
        for (const msg of messageUpdate.messages) {
            const groupId = msg.key.remoteJid;
            const senderJid = msg.key.participant || msg.key.remoteJid;
            const senderNumber = senderJid.replace(/[@.a-z]/g, '');
            const messageContent = msg.message?.conversation || '';

            if (messageContent.toLowerCase() === 'bot') {
                console.log(`📌 Bot Random Message Requested by ${senderNumber}`);

                // ✅ র‍্যান্ডম মেসেজের লিস্ট
                const randomMessages = [
                    ` @${senderNumber}, আহ শুনা আমার তোমার অলিতে গলিতে উম্মাহ😇😘`,
                    ` @${senderNumber}, নিজেকে যদি একা মনে হয়, তাহলে ভূতের সিনেমা দেখো, সবসময় মনে হবে তোমার পেছনে কেও আছে!`,
                    ` @${senderNumber},🐸সিহ ইউ নট ফর মাইন্ডヅ- 'ডু ইউ লাভ মি!!-🙄🙊 😒 দেখলাম তোমি পড়তে পারো কিনা 🙊🤦‍♀️🤦‍♀️`,
                    ` @${senderNumber}, 𝚘𝐢𝐢-ইত্তু 🤏 ভালু'পাসা দিবা-🫣🥺🐼`,
                    ` @${senderNumber}, কি গো সোনা আমাকে ডাকছ কেনো`,
                    ` @${senderNumber}, আমাকে এতো না ডেকে দীপ রে একটা গফ দে 🙄`,
                    ` @${senderNumber}, কি গো সোনা আমাকে ডাকছ কেনো`,
                    ` @${senderNumber}, হুম জান তোমার অইখানে উম্মমাহ😷😘`,
                    ` @${senderNumber}, আহ শোনা আমার আমাকে এতো ডাক্তাছো কেনো আসো বুকে আশো🥱`,
    `@${senderNumber}, 🤭 তুমি কি জানো? বৃষ্টির ফোঁটার চেয়ে বেশি সুন্দর হচ্ছে তোমার হাসি! 😍`,
    `@${senderNumber}, 🌟 আমার প্রেমে পড়লে আগে থেকে সাবধান! কারণ আমার হৃদয়টা ফাটা বেলুনের মতো, একবার চেপে ধরলে 💔 ফুসসসস করে সিধা তোর হৃদয়ে 😜`,
    `@${senderNumber}, 📢 "প্রেম করবো না" বলে বলে শেষ পর্যন্ত পটেই গেলে? 🤣`,
    `@${senderNumber}, 🏆 তুমি তো একদম "বাটারফ্লাই" 💕 যেখানে ভালোবাসা, সেখানেই উড়ে উড়ে যাই 😂`,
    `@${senderNumber}, 🍟 ফ্রেঞ্চ ফ্রাইসের মতো আমার মন, শুধু তোমার সঙ্গে থাকতে চায়! 🍔`,
    `@${senderNumber}, 🚀 তুমি যদি হারিয়ে যাও, তাহলে GPS অন করে আমাকেই কল করো! 😜`,
    `@${senderNumber}, 😎 আরে ভাই! আমি কিন্তু ফ্রি, প্রেম করতে চাইলে এখনই বলো! 😉`,
    `@${senderNumber}, 🦸‍♂️ সুপারম্যান তো দূরের কথা, আমি শুধু তোমার "ম্যানে" হতে চাই! 😆`,
    `@${senderNumber}, 🎵 তুমি আমার হৃদয়ের DJ, তোমার মিউজিকেই আমার মন নাচে! 💃`,
    `@${senderNumber}, 🤔 বিয়ের পর কি বউ-এর কথাই শুনতে হয়? নাকি মাঝে মাঝে নিজের কথাও বলতে পারবো? 🤣`,
    `@${senderNumber}, 💖 আকাশের তারারা মাটিতে নামে না, কিন্তু তুই নামলেই আমার মনটা উড়ে যায়! ✨`,
    `@${senderNumber}, 😘 তোমার কাছে যাওয়ার রাস্তা গুগল ম্যাপে পাওয়া যায় না, কারণ তা সরাসরি হৃদয়ের দিকেই যায়! 😍`,
    `@${senderNumber}, 🦄 তুমি যদি রংধনুর রঙ হতে, আমি হইতাম বৃষ্টি! 🌈`,
    `@${senderNumber}, 🍫 তুই চকলেট হলে আমি হতাম কভার, কারণ আমি ছাড়া তুই অসম্পূর্ণ! 😜`,
    `@${senderNumber}, 💡 তুমি আমার জীবনের আলো, কিন্তু মাঝে মাঝে লোডশেডিং কেন করো? 😂`,
    `@${senderNumber}, 🏝️ ভালোবাসা হলো এক বিচিত্র দ্বীপ! সেখানে শুধু আমাদের দুজনের প্রবেশাধিকার! 💑`,
    `@${senderNumber}, 😜 তুমি কি জানো? একদিন আমি তোমার প্রেমে পড়ে গিয়েছিলাম, তারপর থেকে আর উঠতে পারিনি! 😂`,
    
    `@${senderNumber}, 🌸তুমি আমার ড্রাইভিং লাইসেন্স ছাড়া গাড়ি! তোমাকে ছাড়া আমি চলতে পারি না! 🚗💕`,
    `@${senderNumber}, 😍 জানো, তোমার হাসি আমার মোবাইলের চার্জের থেকেও বেশি শক্তিশালী! 🔋✨`,
    `@${senderNumber}, 🍕 তুমি যদি পিজ্জা হও, আমি হবো চিজ! কারণ তোমার সঙ্গে থাকলেই জীবনটা আসলেই সুস্বাদু! 😋`,
    `@${senderNumber}, 💘 তুমি আমার হৃদয়ের WiFi, তোমার ছাড়া আমার সিগন্যাল কাজ করে না! 📶😜`,
    `@${senderNumber}, 🎭 তুমি আমার জীবনের নায়িকা, কিন্তু প্লট টুইস্ট হচ্ছে—তুমিই আমাকে পটিয়েছ! 🤣`,
    `@${senderNumber}, 💞 জানু, তুমি কি জানো? আমি একাই তোমাকে এত ভালোবাসি, তোমার আর কাউকে লাগবে না! 😉`,
    `@${senderNumber}, 🥺 তুমি কি কফি? কারণ তুমি ছাড়া আমার সকাল শুরু হয় না! ☕❤️`,
    `@${senderNumber}, 🎤 তুমি যদি আমার জীবনের গান হও, তাহলে আমি হবো স্পিকার! সবসময় তোমার কথাই বাজবে! 🔊`,
    `@${senderNumber}, 🔥 তুমি কি আগুন? কারণ তোমার চোখে তাকালেই আমার হৃদয় পুড়ে যায়! 🔥🥵`,
    `@${senderNumber}, 🍎 তুমি যদি আমার হৃদয়ের Apple হও, তাহলে আমি হবো Steve Jobs! কারণ আমি তোমাকে ছাড়া অসম্পূর্ণ! 🤭`,
    `@${senderNumber}, 🕺💃 তুমি আর আমি যেন একসাথে একটা নাচের জুটি! জীবনের প্রতিটি ছন্দ আমরা একসাথে উপভোগ করবো! 💖`,
    `@${senderNumber}, 😍 তুমি কি জানো, আমার মন হচ্ছে একটা WhatsApp চ্যাট, যেখানে শুধু তোমার কথাই থাকে! 📲💚`,
    `@${senderNumber}, 🤯 তুমি যদি মিস্ট্রি হও, তাহলে আমি হবো ডিটেকটিভ! কারণ আমি প্রতিদিন তোমাকে বুঝতে চাই! 🔍🕵️‍♂️`,
    `@${senderNumber}, 🎬 তুমি আমার জীবনের সিনেমা, আর আমি তোমার সবচেয়ে বড় ফ্যান! 🍿😍`,
    `@${senderNumber}, 🏆 তুমি আমার জীবনের ট্রফি, কারণ তোমাকে পেয়ে আমি জীবনের বিজয়ী! 🎖️❤️`,
    `@${senderNumber}, 🌍 তুমি যদি পৃথিবী হও, আমি হবো চাঁদ! কারণ আমি শুধু তোমাকেই ঘিরে থাকি! 🌙💕`,
    `@${senderNumber}, 🤗 তুমি কি জানো, তোমার কোলের মধ্যে একটা আশ্রয় আছে, যেখানে আমার মন সব দুঃখ ভুলে যায়! ❤️`,
    `@${senderNumber}, 🤭 তুমি যদি নৌকা হও, আমি হবো নদী! তোমাকে সারাজীবন বয়ে নিয়ে যাবো! ⛵💙`,
    `@${senderNumber}, 🎶 তুমি যদি মিউজিক হও, তাহলে আমি হবো লিরিক্স! কারণ তোমার সঙ্গে থাকলেই আমার জীবন সুন্দর লাগে! 🎼💜`,
    `@${senderNumber}, 🌟 তুমি যদি নক্ষত্র হও, তাহলে আমি হবো রাতের আকাশ! কারণ তোমাকে ছাড়া আমার অস্তিত্ব নেই! ✨🌌`,
    `@${senderNumber}, 💍 তুমি কি আংটি? কারণ আমি শুধু তোমার জন্যই আমার হাতটা খালি রেখেছি! 😉`,
    `@${senderNumber}, 😘 তুমি কি জানো, আমি তোমার ওপর এতটাই ক্রাশ খেয়েছি, এখন ডাক্তারও আমাকে ঠিক করতে পারবে না! 🤕😂`,
    `@${senderNumber}, 🚀 তুমি যদি রকেট হও, তাহলে আমি হবো লঞ্চপ্যাড! কারণ তুমি যেখানেই যাও, আমি সবসময় তোমার সাপোর্ট সিস্টেম! 🔥`,
    `@${senderNumber}, 🥰 তোমাকে ছাড়া জীবন যেন এক গরমে আইসক্রিম!溶けちゃうよ~溶けちゃうよ~😜`,
    `@${senderNumber}, 🎈 তুমি যদি বেলুন হও, তাহলে আমি হবো হাওয়া! কারণ তুমি আমাকে ছাড়া উড়তে পারবে না! 🤭`,
    `@${senderNumber}, 💕 জানু, তুমি কি WiFi? কারণ তোমাকে ছাড়া আমার কানেকশন চলে না! 📶😂`,
    `@${senderNumber}, 🤭 তুমি কি Calculator? কারণ তোমাকে দেখলেই আমার হৃদয় দ্রুতগতি শুরু করে! 🔢❤️`,
    `@${senderNumber}, 🍩 তুমি যদি ডোনাট হও, আমি হবো কফি! কারণ আমাদের জুটি পারফেক্ট! ☕💕`,
    `@${senderNumber}, 🌈 তুমি কি রংধনু? কারণ তোমার হাসি আমার জীবনে সাতটা রঙ যোগ করে! 😍`,
    `@${senderNumber}, 🎀 তুমি আমার হৃদয়ের উপহার, যা প্রতিদিন নতুন ভালোবাসা নিয়ে আসে! 🎁❤️`,
    `@${senderNumber}, 🤗 তুমি যদি কম্বল হও, আমি হবো শীতকাল! কারণ তোমার উষ্ণতাই আমার সবকিছু! ❄️🔥`,
    `@${senderNumber}, 🌍 তুমি যদি গুগল হও, আমি হবো সার্চ বক্স! কারণ সব প্রশ্নের উত্তর আমি তোমার মধ্যেই খুঁজি! 🔎💕`,
    `@${senderNumber}, 🍫 তুমি কি চকোলেট? কারণ তোমার মিষ্টি হাসি আমাকে একদম গলে ফেলেছে! 😋`,
    `@${senderNumber}, 🎸 তুমি যদি গিটার হও, আমি হবো স্ট্রিং! কারণ তোমাকে ছাড়া আমার সুর বাজে না! 🎶💖`,
    `@${senderNumber}, 🧸 তুমি যদি টেডি বিয়ার হও, তাহলে আমি হবো ছোট্ট শিশু! কারণ তোমাকে জড়িয়ে না ধরলে ভালো লাগে না! 🤗`,
    `@${senderNumber}, 😜 তুমি কি ম্যাগনেট? কারণ তুমি আমার দিকে অজান্তেই টেনে নিচ্ছো! 🧲💕`,
    `@${senderNumber}, 🌊 তুমি যদি সমুদ্র হও, আমি হবো ঢেউ! কারণ আমি তোমাকে ছাড়া চলতে পারি না! 🌊💙`,
    `@${senderNumber}, 🏠 তুমি আমার হৃদয়ের একমাত্র ঠিকানা! তোমার ছাড়া আমি হারিয়ে যাই! 💕`,
    `@${senderNumber}, 🍿 তুমি যদি পপকর্ন হও, আমি হবো মুভি! কারণ তুমি ছাড়া আমার গল্প অসম্পূর্ণ! 🎬💕`,
    `@${senderNumber}, 🚀 তুমি যদি চাঁদ হও, আমি হবো রকেট! কারণ তোমাকে পাওয়ার জন্য আমি সবকিছু করতে পারি! 🌙🚀`,
    `@${senderNumber}, 🎭 জীবন একটা সিনেমা, আর তুমি তার প্রধান নায়িকা! 😍`,
    `@${senderNumber}, 🏆 তুমি আমার জীবনের সেরা পুরস্কার, যা আমি পেয়ে গর্বিত! 🏅💕`,
    `@${senderNumber}, 💞 তুমি কি পাসওয়ার্ড? কারণ তোমার ছাড়া আমার হৃদয় আনলক হয় না! 🔐💘`,
    `@${senderNumber}, 🚴 তুমি যদি সাইকেল হও, আমি হবো চাকা! কারণ তুমি ছাড়া আমি চলতে পারি না! 🛞❤️`,
    `@${senderNumber}, 🌟 তুমি যদি আকাশের তারা হও, আমি হবো রাত! কারণ তুমি ছাড়া আমি অন্ধকার! 😍`,
    `@${senderNumber}, 🧩 তুমি যদি পাজলের এক টুকরা হও, আমি হবো বাকি অংশ! কারণ আমরা একসঙ্গে ফিট! 😘`,
    `@${senderNumber}, 🤭 তুমি যদি আইসক্রিম হও, আমি হবো ফ্রিজ! কারণ তোমাকে শুধুমাত্র আমি ধরে রাখতে পারবো! 🍦`,
    `@${senderNumber}, 🌺 তুমি আমার হৃদয়ের একমাত্র ফুল, যা কখনো শুকাবে না! 🌷💕`,
    `@${senderNumber}, 😍 তুমি যদি সোশ্যাল মিডিয়া হও, আমি হবো নোটিফিকেশন! কারণ আমি সবসময় তোমাকে নিয়ে ব্যস্ত থাকি! 🔔💘`,
    `@${senderNumber}, 🎨 তুমি যদি আমার ক্যানভাস হও, আমি হবো ব্রাশ! কারণ তোমাকে ছাড়া আমার জীবন অরঙিন! 🎭`,
    `@${senderNumber}, 😆 জানু, আমি যদি তোমাকে মিস করি, তুমি কি আমার কাছে চলে আসবে? নাকি আমাকে কিডন্যাপ করতে হবে? 🤭`,
    `@${senderNumber}, 🏝️ তুমি যদি দ্বীপ হও, আমি হবো সমুদ্র! কারণ আমি সবসময় তোমাকে ঘিরে থাকবো! 💙`,
    `@${senderNumber}, 🔥 তুমি যদি আগুন হও, আমি হবো মোম! কারণ আমি শুধু তোমার আলোতেই গলে যেতে চাই! 🕯️💖`
                ];

                // ✅ র‍্যান্ডমভাবে একটি মেসেজ সিলেক্ট করা
                const randomText = randomMessages[Math.floor(Math.random() * randomMessages.length)];

                // ✅ রিপ্লাই পাঠানো (Mention সহ)
                await sock.sendMessage(groupId, { 
                    text: randomText,
                    mentions: [senderJid]
                });
            }
        }
    });
}
