import { Hono } from 'hono';
import { PrismaClient } from './generated/prisma/client';
import { PrismaD1 } from '@prisma/adapter-d1';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { cors } from 'hono/cors';
import fetch from 'node-fetch';
import 'dotenv/config';

const app = new Hono<{ Bindings: Env }>();
const geminiApiKey = process.env.GOOGLE_API_KEY ?? '';
const ai = new GoogleGenerativeAI(geminiApiKey);
const mapApiKey = process.env.GOOGLE_MAP_API_KEY ?? '';
const tiktokApiKey = process.env.TIKTOK_URL ?? '';

app.use(
  '*',
  cors({
    origin: '*', // 必要に応じて制限可能
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
  }),
);

app.get('/', (c) => c.text('Hono!'));

app.get('/test', async (c) => {
  const adapter = new PrismaD1(c.env.DB);
  const prisma = new PrismaClient({ adapter });

  const place = await prisma.place.create({
    data: {
      tiktokTitle: 'title',
    },
  });

  return c.json(place);
});

app.post('/api/tiktok', async (c) => {
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
    const url = `${tiktokApiKey}/get?q=${key}`;
    const response = await fetch(url);
    const body = (await response.json()) as Tiktok[];

    for (const tiktok of body) {
      const place = await prisma.place.create({
        data: {
          tiktokTitle: tiktok.title,
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

app.get('/markers', async (c) => {
  const adapter = new PrismaD1(c.env.DB);
  const prisma = new PrismaClient({ adapter });

  const latMin = Number(c.req.queries('latMin'));
  const latMax = Number(c.req.queries('latMax'));
  const lngMin = Number(c.req.queries('lngMin'));
  const lngMax = Number(c.req.queries('lngMax'));
  const scale = Number(c.req.queries('scale')); // これは今は使ってないけど必要なら使えるようにしておく！

  if (isNaN(latMin) || isNaN(latMax) || isNaN(lngMin) || isNaN(lngMax)) {
    return c.json({ error: 'Invalid query parameters' }, 400);
  }

  const places = await prisma.place.findMany({
    where: {
      latitude: {
        gte: latMin,
        lte: latMax,
      },
      longitude: {
        gte: lngMin,
        lte: lngMax,
      },
      scale: {
        gte: scale,
      },
    },
  });

  return c.json(places);
});

app.put('/api/google/gemini', async (c) => {
  try {
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const adapter = new PrismaD1(c.env.DB);
    const prisma = new PrismaClient({ adapter });

    const allResults: any[] = [];
    const chat = model.startChat({});
    const places = await prisma.place.findMany();

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    for (const place of places) {
      let id = place.id;
      console.log(`id: ${id}`);
      const prompt = `
        「Title: ${place.tiktokTitle}
        User: ${place.userName}
        Likes: ${place.likes}, views:${place.views}
        Tags: ${JSON.parse(place.tags || '[]')}
        URL: ${place.url}」

        この投稿は場所の詳細が曖昧な可能性がありますが、分かる範囲で「place（場所）」「explanation（料理や雰囲気の説明）」を推測して返してください。
        もしわからない場合は "不明"としてください

        ここで示した場所を以下のjsonschemaの形式で返答してください:
        \`\`\`jsonschema
        {
            "place": "場所名",
            "title": "店舗名",
            "explanation": "場所の説明"
        }
        \`\`\`
        `;

      const result = await chat.sendMessage(prompt);
      const text: string = result.response.text();
      console.log(text);

      // JSON部分を抽出する正規表現
      const match = text.match(/```(?:json|jsonschema)?\s*([\s\S]*?)\s*```/);

      let parsed;
      if (match && match[1]) {
        try {
          parsed = JSON.parse(match[1]);
        } catch (e) {
          console.error('JSON parse error:', e);
          return c.json(
            { error: 'Invalid JSON format in Gemini response' },
            400,
          );
        }
      } else {
        console.warn('No JSON block found, fallback to raw parse');
        try {
          parsed = JSON.parse(text);
        } catch (e) {
          console.error('Fallback JSON parse error:', e);
          return c.json({ error: 'Could not parse response as JSON' }, 400);
        }
      }

      console.log(`parsed: ${JSON.stringify(parsed)}`);
      console.log(`title: ${parsed.title}`);
      console.log(`place: ${parsed.place}`);

      await prisma.place.update({
        where: { id },
        data: {
          place: parsed.place ?? 'null',
          title: parsed.title ?? 'null',
          explanation: parsed.explanation ?? 'null',
        },
      });

      await sleep(4600); // wait for 4.6 seconds
    }

    return c.json({ allResults });
  } catch (error) {
    console.error('Error:', error);
    return c.json({ error: 'An error occurred' }, 500);
  }
});

app.put('/api/google/locations', async (c) => {
  const adapter = new PrismaD1(c.env.DB);
  const prisma = new PrismaClient({ adapter });
  const places = await prisma.place.findMany();

  const allResults: any[] = [];
  for (const place of places) {
    let id = place.id;

    if (place.title == '不明' && place.place == '不明') {
      console.log(`Skipping place ID ${id} due to missing title or place`);
      continue;
    }

    if (
      !place.title ||
      !place.place ||
      place.title == 'null' ||
      place.place == 'null'
    ) {
      console.log(`Skipping place ID ${id} due to missing title or place`);
      continue;
    }
    const response = await fetch(
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': mapApiKey,
          'X-Goog-FieldMask':
            'places.displayName,places.formattedAddress,places.priceLevel,places.location,places.photos,places.editorialSummary',
        },
        body: JSON.stringify({
          textQuery: `${place.title} ${place.place}`,
        }),
      },
    );

    const data = await response.json();
    //
    if (
      data.places &&
      Array.isArray(data.places) &&
      data.places.length > 0 &&
      data.places[0].location
    ) {
      const placeInfo = data.places[0];
      const lat = placeInfo.location.latitude;
      const lon = placeInfo.location.longitude;

      console.log(`address: ${placeInfo.formattedAddress}`);
      console.log(`lat: ${lat} lon : ${lon}`);

      await prisma.place.update({
        where: { id },
        data: {
          latitude: lat ?? null,
          longitude: lon ?? null,
          address: placeInfo.formattedAddress ?? null,
        },
      });
    } else {
      console.log(
        `Skipping update for ID ${id} due to missing or invalid places data`,
      );
    }
    allResults.push(data);
  }
  return c.json({ allResults });
});

app.get('api/google/photo', async (c) => {
  const adapter = new PrismaD1(c.env.DB);
  const prisma = new PrismaClient({ adapter });
  const places = await prisma.place.findMany();

  for (const place of places) {
    let id = place.id;
    if (place.title == '不明' && place.place == '不明') {
      console.log(`Skipping place ID ${id} due to missing title or place`);
      continue;
    }

    if (
      !place.title ||
      !place.place ||
      place.title == 'null' ||
      place.place == 'null'
    ) {
      console.log(`Skipping place ID ${id} due to missing title or place`);
      continue;
    }
    const query = `${place.place} ${place.title}`;
    // Place ID 取得
    const placeIdRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(
        query,
      )}&inputtype=textquery&fields=place_id&key=${mapApiKey}`,
    );
    const placeIdData = await placeIdRes.json();
    const placeId = placeIdData?.candidates?.[0]?.place_id;

    if (!placeId) {
      continue;
    }

    // Photo reference 取得
    const photoRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos&key=${mapApiKey}`,
    );
    const photoData = await photoRes.json();
    const photoReference = photoData?.result?.photos?.[0]?.photo_reference;

    if (!photoReference) {
      continue;
    }

    // 画像URL生成（リダイレクト先URL）
    const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photoReference}&key=${mapApiKey}`;

    await prisma.place.update({
      where: { id },
      data: {
        photoName: photoUrl ?? 'null',
      },
    });
    console.log(`${query},
    place_id: ${placeId},
    photo_url: ${photoUrl},`);
  }

  return c.text('ok');
});

app.put('/scale', async (c) => {
  const adapter = new PrismaD1(c.env.DB);
  const prisma = new PrismaClient({ adapter });
  const places = await prisma.place.findMany();

  for (const place of places) {
    let id = place.id;
    const likes = place.likes ?? 0;

    let scale = 1;
    if (likes > 100_000) {
      scale = 3;
    } else if (likes > 10_000) {
      scale = 2;
    }

    const data = await prisma.place.update({
      where: { id },
      data: { scale },
    });

    console.log(data);
  }
  return c.text('ok');
});

export default app;
