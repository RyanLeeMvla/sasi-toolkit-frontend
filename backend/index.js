const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Initialize the OpenAI SDK v4
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.post("/generate", async (req, res) => {
  const { symptom, dismissal } = req.body;

  try {
    // ✅ Use v4 method for chat completions
    const chatCompletion = await openai.chat.completions.create({
      model: "gpt-4", // or "gpt-3.5-turbo"
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
  • The Affordable Care Act (e.g., 42 U.S.C. § 18001)
  • HIPAA (e.g., 45 CFR § 164.524)
  • Civil Rights Act protections (e.g., 42 U.S. Code § 2000d)
  • The Parity Law (e.g., 29 U.S.C. § 1185a)
  • The Joint Commission standards
- Be at least 4 sentences long.
- Use direct, educated language that builds trust but firmly requests care.
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

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`✅ Backend running on port ${PORT}`));
