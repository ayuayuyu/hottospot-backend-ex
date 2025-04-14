import { Hono } from 'hono';
import { PrismaClient } from './generated/prisma/client';
import { PrismaD1 } from '@prisma/adapter-d1';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { cors } from 'hono/cors';
import fetch from 'node-fetch';
import 'dotenv/config';

const app = new Hono<{ Bindings: Env }>();
const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY ?? '';
const ai = new GoogleGenerativeAI(apiKey);

app.use(
  '*',
  cors({
    origin: '*', // 必要に応じて制限可能
    allowMethods: ['GET', 'POST', 'DELETE'],
  }),
);

app.get('/', (c) => c.text('Hono!'));

app.get('/test', async (c) => {
  const adapter = new PrismaD1(c.env.DB);
  const prisma = new PrismaClient({ adapter });

  const place = await prisma.place.create({
    data: {
      title: 'title',
    },
  });

  return c.json(place);
});

app.post('/sync/tiktok', async (c) => {
  interface Tiktok {
    title: string;
    url: string;
    userName: string;
    video_id: string;
    likes: number;
    views: number;
    tags: string[];
    created_at: string;
  }

  const keywords = ['カフェ', '観光', '遊び場'];
  const allResults: Tiktok[] = [];
  const adapter = new PrismaD1(c.env.DB);
  const prisma = new PrismaClient({ adapter });

  for (const key of keywords) {
    const url = `${c.env.TIKTOK_URL}/get?q=${key}`;
    const response = await fetch(url);
    const body = (await response.json()) as Tiktok[];

    for (const tiktok of body) {
      const place = await prisma.place.create({
        data: {
          title: tiktok.title,
          likes: tiktok.likes,
          views: tiktok.views,
          userName: tiktok.userName,
          tags: JSON.stringify(tiktok.tags),
          url: tiktok.url,
        },
      });
      console.log(place);
    }

    allResults.push(...body);
  }

  return c.json(allResults);
});

//placeを全て削除する
app.delete('/del', async (c) => {
  const adapter = new PrismaD1(c.env.DB);
  const prisma = new PrismaClient({ adapter });

  const place = await prisma.place.deleteMany();

  return c.json(place);
});
app.get('/get', async (c) => {
  const adapter = new PrismaD1(c.env.DB);
  const prisma = new PrismaClient({ adapter });

  const place = await prisma.place.findMany();

  return c.json(place);
});

app.post('/chat', async (c) => {
  try {
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // const chat = model.startChat({

    //   generationConfig: {
    //     maxOutputTokens: 100,
    //   },
    // });

    const { chatHistory, msg } = await c.req.json();
    console.log('chatHistory', chatHistory);
    console.log('msg', msg);

    const chat = model.startChat({
      history: chatHistory,
    });
    //prismaを使ってdbから値を持ってきてプロンプトする予定
    //まずは動かせるかの確認してから↑をやって

    const prompt = `
    「Title: 尾道に行ってきましたー！ #絶景 #自然 #旅行  #nature #japantravel 
User: @yuki_travel
Likes: 261700, Plays: 6800000
Tags: ['絶景', '自然', '旅行', 'nature', 'japantravel']
URL: https://m.tiktok.com/v/7381023303550373121」

ここで示した場所を次の形式で返答してください:
  \`\`\`jsonschema
  {
    "area":"地名”,
    "located
  }
  \`\`\`
    `;

    const msgWithPrompt = `${prompt}\n${msg}`;

    console.log('msg', msg);
    const result = await chat.sendMessage(msgWithPrompt);
    const response = await result.response;
    const text = response.text();

    console.log('text', text);
    return c.json({ text });
  } catch (error) {
    console.error('Error:', error);
    return c.json({ error: 'An error occurred' }, 500);
  }
});

export default app;
