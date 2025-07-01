const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');

// const { createClient } = require('@supabase/supabase-js');
// const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

require('dotenv').config();
const OpenAI = require('openai');

const app = express();
const httpServer = createServer(app); // 👈 unified HTTP + WebSocket
const PORT = process.env.PORT || 4000;

const multer = require('multer');
const fs = require('fs');
const upload = multer({ dest: 'uploads/' });



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

// 🔁 Route: Button press trigger from ESP32 or any remote source
app.post('/trigger-button', (req, res) => {
  io.emit('buttonPress');
  console.log('🟢 Button press emitted to clients');
  res.json({ status: 'Button press emitted' });
});

app.post('/extract', async (req, res) => {
  const { transcript } = req.body;
  console.log("🎤 Received transcript:", transcript);

  try {
    // ✏️ Step 1: Summarize the transcript
    const summaryChat = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `
Summarize this patient statement in 1-2 sentences. 
Focus on the medical concern and any dismissal or frustration they express.
Keep it short and clear.
        `.trim()
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

    // 🧠 Step 2: Extract structured info from summary
    const extractChat = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `
You are an AI assistant helping extract structured information from a patient summary. 
Return a JSON object with exactly these keys: "symptom", "dismissal", "action".
No commentary. Output example:
{"symptom":"...", "dismissal":"...", "action":"..."}
        `.trim()
        },
        {
          role: "user",
          content: `Summary: "${summary}"`
        }
      ],
      temperature: 0.4
    });

    console.log("📦 Parsed object:");
    console.log(parsed);

    const parsed = JSON.parse(extractChat.choices[0].message.content.trim());
    res.json({ ...parsed, summary });

  } catch (err) {
    console.error("❌ Error in /extract:", err);
    res.status(500).json({ error: "Failed to summarize or extract data" });
  }
});

// app.post('/debug-audio', upload.single('audio'), (req, res) => {
//   if (!req.file) {
//     console.log("❌ No file received at /debug-audio");
//     return res.status(400).send("No file uploaded");
//   }

//   console.log("✅ Received file at /debug-audio:");
//   console.log(` - Field name: ${req.file.fieldname}`);
//   console.log(` - Original name: ${req.file.originalname}`);
//   console.log(` - Size: ${req.file.size} bytes`);

//   res.json({ status: "File received", size: req.file.size });
// });

app.post('/transcribe', upload.single('audio'), async (req, res) => {
    try {
      const audioPath = req.file.path;

      console.log("📥 Received audio file:");
      console.log(`🧾 Filename: ${req.file.originalname}`);
      console.log(`📁 Saved as: ${req.file.path}`);

      try {
        const { execSync } = require('child_process');
        const result = execSync(`ffprobe -v error -show_format -show_streams ${audioPath}`);
        console.log("🎵 ffprobe output:\n" + result.toString());
      } catch (ffErr) {
        console.error("❌ ffprobe failed:", ffErr.message);
      }

      const transcription = await openai.audio.transcriptions.create({
        
        file: fs.createReadStream(audioPath),
        model: 'whisper-1',
        response_format: 'json'
      });
      console.log("🎙️ Whisper transcription complete:");
      console.log(transcription.text);

      console.log("📝 Transcript:", transcription.text);
      


      // Pipe result to existing /extract logic
      const extractRes = await fetch(`http://localhost:${PORT}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: transcription.text })
        
      });
      console.log("🔁 Sent transcript to /extract for parsing.");

      const parsed = await extractRes.json();
      fs.unlinkSync(audioPath); // clean up temp file

      console.log("✅ Final parsed JSON to send:");
      console.log(parsed);
      res.json(parsed);
    } catch (err) {
      console.error("❌ Error in /transcribe:", err);
      res.status(500).json({ error: "Transcription failed" });
    }
  });


  app.get('/transcribe', (req, res) => {
    res.status(200).send('🧠 /transcribe is live and waiting for POSTs!');
  });


// 🧠 Route: Generate story using OpenAI
app.post('/generate', async (req, res) => {
  const { symptom, dismissal } = req.body;

  try {
    const chatCompletion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are a healthcare advocate helping patients respond to dismissal."
        },
        {
          role: "user",
          content: `A patient is experiencing "${symptom}", and the doctor said "${dismissal}". 
As a healthcare advocate, generate a professional, respectful, and assertive response that the patient can say in return. Write in the first person, and pretend that you are the patient. Pretend that this issue means the world to you.
The response should:
- Reference real, legally binding policies such as:
  • Affordable Care Act (42 U.S.C. § 18001): Expands access to insurance, bans denial for preexisting conditions, and mandates coverage for services like preventive care and mental health.
• HIPAA (45 CFR § 164.524): Grants patients the right to access and review their medical records, promoting transparency and continuity of care.
• Civil Rights Act (42 U.S.C. § 2000d): Prohibits discrimination in federally funded healthcare—supports equitable treatment and language access.
• Parity Law (29 U.S.C. § 1185a): Requires equal coverage for mental health and addiction treatment as for physical conditions.
• Joint Commission Standards: Accreditation guidelines for healthcare facilities, covering patient safety, infection control, and quality of care.
- Be at least 4 sentences long.
- Use direct, educated language that builds trust but firmly requests care.
- Adress the patient's specific symptom and the doctor's dismissal, include word for word.
- Include at least one legal citation using its actual law code or regulation number in quotes.
Do not apologize or minimize the patient’s concerns. Use first-person language (e.g., "I appreciate", "I understand", "I request").`
        }
      ]
    });

    const reply = chatCompletion.choices[0].message.content;
    res.json({ message: reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Start HTTP + WebSocket server
httpServer.listen(PORT, () => {
  console.log(`🚀 Backend + Socket.IO server listening on port ${PORT}`);
});
