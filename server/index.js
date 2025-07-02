const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY // use service_role for server-side
);

const OpenAI = require('openai');
const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 4000;

const multer = require('multer');
const fs = require('fs');
const upload = multer({ dest: 'uploads/' });
const WebSocket = require('ws');
const path = require('path');

// ✅ Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// ✅ Socket.IO setup
const io = new Server(httpServer, {
  cors: {
    origin: '*', // Replace with your Vercel URL for security
    methods: ['GET', 'POST']
  }
});

io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('❌ Socket disconnected:', socket.id);
  });
});

// ✅ OpenAI SDK v4 initialization
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// JWT middleware (Express backend)
const jwt = require('jsonwebtoken');
const supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET;

const authenticateJWT = (req, res, next) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  jwt.verify(token, supabaseJwtSecret, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Forbidden' });
    req.user_id = decoded.sub; // Supabase user ID
    next();
  });
};

// 🔁 Route: Button press trigger from ESP32 or any remote source
app.post('/trigger-button', (req, res) => {
  io.emit('buttonPress');
  console.log('🟢 Button press emitted to clients');
  res.json({ status: 'Button press emitted' });
});

app.post('/timeline', authenticateJWT, async (req, res) => {
  const { title, description, event_time } = req.body;
  const user_id = req.user_id;

  try {
    // 1) Insert and return the new row
    const { data, error } = await supabase
      .from('timeline_events')
      .insert([{
        user_id,
        title:       title       || 'Untitled Event',
        description: description || '',
        event_time:  event_time  || new Date().toISOString()
      }])
      .select();  // ← crucial!

    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ error: error.message });
    }

    // 2) Respond with success and the new record’s ID
    return res.json({ success: true, id: data[0].id });

  } catch (err) {
    console.error('Unexpected error in /timeline:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.put('/timeline/:id', authenticateJWT, async (req, res) => {
  const { id } = req.params;
  const { title, description, event_time } = req.body;
  const user_id = req.user_id;
  const { error } = await supabase
    .from('timeline_events')
    .update({ title, description, event_time })
    .eq('id', id)
    .eq('user_id', user_id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// Delete timeline event endpoint
app.delete('/timeline/:id', authenticateJWT, async (req, res) => {
  const { id } = req.params;
  const user_id = req.user_id;
  const { error } = await supabase
    .from('timeline_events')
    .delete()
    .eq('id', id)
    .eq('user_id', user_id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// Secure /extract and /generate with JWT middleware
app.use('/extract', authenticateJWT);
app.use('/generate', authenticateJWT);

app.post('/extract', async (req, res) => {
  const { transcript } = req.body;
  const user_id = req.user_id;
  console.log("🎤 Received transcript:", transcript);

  try {
    const summaryChat = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `Summarize this patient statement in 1-2 sentences...`
        },
        {
          role: "user",
          content: transcript
        }
      ],
      temperature: 0.5
    });

    const summary = summaryChat.choices[0].message.content.trim();
    console.log("📝 Summary:", summary);

    const extractChat = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `Return a JSON object with exactly these keys: "symptom", "dismissal", "action"...`
        },
        {
          role: "user",
          content: `Summary: "${summary}"`
        }
      ],
      temperature: 0.4
    });

    const parsed = JSON.parse(extractChat.choices[0].message.content.trim());
    console.log("📦 Parsed object:", parsed);

    // Validate values before insert
    const payload = {
      transcript: transcript || '',
      summary: summary || '',
      symptom: parsed.symptom || '',
      dismissal: parsed.dismissal || '',
      action: parsed.action || '',
      user_id: user_id || null
    };

    console.log("📤 Final insert payload:", payload);
    console.log("📥 Attempting to insert into Supabase...");

    const { error, data } = await supabase
      .from('Sasi-toolkit')
      .insert([payload])
      .select();

    console.log("🧾 Supabase insert result:", { error, data });

    if (error) {
      console.error("❌ Supabase insert failed:", error.message);
    } else {
      console.log("✅ Inserted row ID:", data?.[0]?.id);
    }

    res.json({ ...parsed, summary });

  } catch (err) {
    console.error("❌ Outer error in /extract:", err.message);
    console.error(err.stack);
    res.status(500).json({ error: err.message });
  }
});

app.post('/transcribe', authenticateJWT, upload.single('audio'), async (req, res) => {
  try {
    // 1. Whisper transcription
    const { text } = await openai.audio.transcriptions.create({
      file: fs.createReadStream(req.file.path),
      model: 'whisper-1'
    });

    // 2. GPT-4 extraction
    const parsed = JSON.parse((await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'Return JSON with keys symptom, dismissal, action.' },
        { role: 'user', content: text }
      ]
    })).choices[0].message.content);

    // 3. Save to Supabase
    await supabase.from('Sasi-toolkit').insert([
      {
        transcript: text,
        ...parsed,
        user_id: req.user_id
      }
    ]);

    // 4. Emit to frontend
    io.emit('transcription_result', { transcript: text, ...parsed });
    res.json({ transcript: text, ...parsed });
  } catch (err) {
    console.error('❌ Error in /transcribe:', err);
    res.status(500).json({ error: 'Transcription failed' });
  }
});

// POST /classify-timeline
app.post('/classify-timeline', authenticateJWT, async (req, res) => {
  const { transcript, summary } = req.body;
  try {
    const classification = await openai.chat.completions.create({
      model: "gpt-4",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `You are a smart assistant that decides if a patient's spoken statement should be recorded as a timeline event. 
Return exactly JSON with a single boolean key "addToTimeline". 
Do NOT wrap it in markdown or text.`
        },
        {
          role: "user",
          content: `Transcript: "${transcript}"\nSummary: "${summary}"`
        }
      ]
    });

    const json = JSON.parse(classification.choices[0].message.content.trim());
    return res.json(json);
  } catch (err) {
    console.error("❌ /classify-timeline error", err);
    return res.status(500).json({ addToTimeline: false });
  }
});


// 🧠 Route: Generate story using OpenAI
app.post('/generate', authenticateJWT, async (req, res) => {
  const { symptom, dismissal, timeline } = req.body;
  const user_id = req.user_id;

  // 2️⃣ Build a human-readable summary of the timeline
  const timelineText = (timeline || [])
    .map(ev => `• [${new Date(ev.event_time).toLocaleString()}] ${ev.title}: ${ev.description}`)
    .join('\n') || 'No prior events.';

  try {
    // Generate the AI response
    const chatCompletion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content:
            `The patient has the following past medical events:\n${timelineText}\n\n` +
            "You are a healthcare advocate helping patients respond to dismissal.\n" +
            "As a healthcare advocate, generate a professional, respectful, and assertive response that the patient can say in return. Write in the first person, and pretend that you are the patient. Pretend that this issue means the world to you.\n" +
            "The response should:\n" +
            "- Reference real, legally binding policies such as:\n" +
            "  • Affordable Care Act (42 U.S.C. § 18001): Expands access to insurance, bans denial for preexisting conditions, and mandates coverage for services like preventive care and mental health.\n" +
            "• HIPAA (45 CFR § 164.524): Grants patients the right to access and review their medical records, promoting transparency and continuity of care.\n" +
            "• Civil Rights Act (42 U.S.C. § 2000d): Prohibits discrimination in federally funded healthcare—supports equitable treatment and language access.\n" +
            "• Parity Law (29 U.S.C. § 1185a): Requires equal coverage for mental health and addiction treatment as for physical conditions.\n" +
            "• Joint Commission Standards: Accreditation guidelines for healthcare facilities, covering patient safety, infection control, and quality of care.\n" +
            "- Be at least 4 sentences long.\n" +
            "- Use direct, educated language that builds trust but firmly requests care.\n" +
            "- Address the patient's specific symptom and the doctor's dismissal, include word for word.\n" +
            "- Include at least one legal citation using its actual law code or regulation number in \"quotes\".\n" +
            "Do not apologize or minimize the patient’s concerns. Use first-person language (e.g., \"I appreciate\", \"I understand\", \"I request\")."
        },
        {
          role: "user",
          content: `Symptom: "${symptom}"\nDoctor said: "${dismissal}".`
        }
      ]
    });

    const reply = chatCompletion.choices[0].message.content;

    // Generate a summary of the patient statement
    const summaryChat = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "Summarize this patient statement in 1-2 sentences."
        },
        {
          role: "user",
          content: `A patient is experiencing "${symptom}", and the doctor said "${dismissal}".`
        }
      ],
      temperature: 0.5
    });
    const summary = summaryChat.choices[0].message.content;

    // ✅ Save to Supabase as fallback if it wasn't already logged
    const { error, data } = await supabase
      .from('Sasi-toolkit')
      .insert([{
        transcript: null,
        summary: summary || null,
        symptom: symptom || '',
        dismissal: dismissal || '',
        action: null,
        user_id,
        response: reply
      }])
      .select();

    if (error) {
      console.error("❌ Failed to log manual entry to Supabase:", error.message);
    } else {
      console.log("📦 Logged manual session to Supabase → ID:", data?.[0]?.id);
    }

    res.json({ summary, message: reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// helper to build a 44-byte WAV header
function makeWavHeader(pcmLength) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(pcmLength + 36, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // Mono
  header.writeUInt32LE(16000, 24); // Sample Rate
  header.writeUInt32LE(16000 * 2, 28); // Byte rate
  header.writeUInt16LE(2, 32); // Block align
  header.writeUInt16LE(16, 34); // Bits/sample
  header.write('data', 36);
  header.writeUInt32LE(pcmLength, 40);
  return header;
}

// WebSocket server for /record (raw PCM streaming, JWT-aware)
const wsServer = new WebSocket.Server({ server: httpServer, path: '/record' });

wsServer.on('connection', socket => {
  let chunks = [];
  let userJWT = null;

  socket.on('message', async msg => {
    if (typeof msg === 'string') {
      const data = JSON.parse(msg);
      if (data.type === 'auth') userJWT = data.token;
      if (data.type === 'start') chunks = [];
      if (data.type === 'stop') {
        const pcm = Buffer.concat(chunks);
        const wav = Buffer.concat([makeWavHeader(pcm.length), pcm]);
        const filePath = path.join(__dirname, 'tmp.wav');
        fs.writeFileSync(filePath, wav);

        // Whisper transcription
        const transcription = await openai.audio.transcriptions.create({
          file: fs.createReadStream(filePath),
          model: 'whisper-1'
        });
        fs.unlinkSync(filePath);

        // Call local /extract endpoint with JWT
        const fetch = require('node-fetch');
        const result = await fetch('http://localhost:' + PORT + '/extract', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userJWT || ''}`
          },
          body: JSON.stringify({ transcript: transcription.text })
        });

        const payload = await result.json();
        io.emit('transcriptionResult', { transcript: transcription.text, ...payload });
      }
    } else {
      chunks.push(Buffer.from(msg));
    }
  });
});

// ✅ Start HTTP + WebSocket server
httpServer.listen(PORT, () => {
  console.log(`🚀 Backend + Socket.IO server listening on port ${PORT}`);
});