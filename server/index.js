const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();
const OpenAI = require('openai');

const app = express();
const httpServer = createServer(app); // 👈 unified HTTP + WebSocket
const PORT = process.env.PORT || 4000;

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
    const chat = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `
You are an AI assistant helping extract structured information from a spoken patient story. 
Return a valid JSON object with these three keys ONLY: "symptom", "dismissal", and "action".

Do NOT include any explanation — just return a compact JSON like:
{"symptom":"...", "dismissal":"...", "action":"..."}
          `.trim()
        },
        {
          role: "user",
          content: `Transcript: "${transcript}"`
        }
      ],
      temperature: 0.4
    });

    const jsonText = chat.choices[0].message.content.trim();

    // Validate JSON
    const parsed = JSON.parse(jsonText);
    res.json(parsed);
  } catch (err) {
    console.error("❌ AI extraction error:", err);
    res.status(500).json({ error: "Failed to extract structured info from transcript" });
  }
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
