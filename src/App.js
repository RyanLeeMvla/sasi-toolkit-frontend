import React, { useState, useEffect } from 'react';
import './ToolkitStyle.css';
import ProgressBar from './ProgressBar';
import io from 'socket.io-client';
import { supabase } from './supabaseClient';
import Login from './Login'; // ✅ Import your login component


// ✅ Point to Render backend (adjust this if you set up an environment variable later)
const socket = io('https://sasi-toolkit.onrender.com');

function App() {
  const [tab, setTab] = useState('story');
  const [symptom, setSymptom] = useState('');
  const [dismissal, setDismissal] = useState('');
  const [action, setAction] = useState('');
  const [progress, setProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [user, setUser] = useState(null);
  const [response, setResponse] = useState('Your AI-generated response will appear here.');

  // ✅ Listen for physical button press
  useEffect(() => {
    socket.on('buttonPress', () => {
      console.log("🟢 Physical button pressed!");
      handleFullVoiceInput();
    });
    return () => socket.off('buttonPress');
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });
  }, []);

  if (!user) return <Login />; // ⛔ Show login first

  // 🎤 Single-field mic input
  const startListening = (fieldSetter) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return alert("Speech recognition not supported.");
    
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    setListening(true);

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      fieldSetter(transcript);
    };

    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.start();
  };

  // 🎤 Full voice input → backend extraction → autofill + run story
  const handleFullVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return alert("Speech recognition not supported.");

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    setListening(true);

    recognition.onresult = async (event) => {
      const fullTranscript = event.results[0][0].transcript;
      console.log("🎤 Full transcript:", fullTranscript);

      console.log("📤 Sending transcript to /extract:", fullTranscript);
      try {
        const res = await fetch('https://your-render-backend-url.com/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript: fullTranscript, user_id: user.id })
        });

        const data = await res.json();

        // ✅ Fill input fields from backend response
        setSymptom(data.symptom || '');
        setDismissal(data.dismissal || '');
        setAction(data.action || '');

        // Auto-run story generation
        handleSubmit(data.symptom, data.dismissal);
        console.log("✅ Received structured data from backend:", data);
        console.log("📌 Autofilling fields:");
        console.log("Symptom:", data.symptom);
        console.log("Dismissal:", data.dismissal);
        console.log("Action:", data.action);
      } catch (err) {
        console.error("Error parsing transcript:", err);
        setResponse("Error parsing voice transcript.");
      }

    };

    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.start();
  };

  // ✍️ Generate AI story
  const handleSubmit = async (customSymptom, customDismissal) => {
    const usedSymptom = customSymptom !== undefined ? customSymptom : symptom;
    const usedDismissal = customDismissal !== undefined ? customDismissal : dismissal;

    setIsLoading(true);
    setResponse('Generating story…');
    setProgress(0);
    await new Promise(res => setTimeout(res, 300));

    let progressValue = 0;
    const interval = setInterval(() => {
      progressValue += 5;
      if (progressValue < 90) setProgress(progressValue);
      else clearInterval(interval);
    }, 300);

    try {
      const res = await fetch('https://your-render-backend-url.com/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symptom: usedSymptom, dismissal: usedDismissal, user_id: user.id })
      });

      const data = await res.json();
      clearInterval(interval);
      setProgress(100);
      await new Promise(res => setTimeout(res, 300));
      setIsLoading(false);
      setResponse(`📝 Summary:\n${data.summary}\n\n💬 AI Sentence:\n${data.message}`);
    } catch (err) {
      clearInterval(interval);
      setProgress(0);
      setIsLoading(false);
      setResponse('Error: ' + err.message);
    }
  };

  return (
    <div className="App">
      <h1>🧠 Storytelling Toolkit for Patients</h1>

      <div>
        <h1>Welcome, {user.email}</h1>
        {/* your app UI here */}
      </div>

      <div className="tabs">
        <button className={tab === 'story' ? 'active' : ''} onClick={() => setTab('story')}>Build Your Story</button>
        <button className={tab === 'frames' ? 'active' : ''} onClick={() => setTab('frames')}>Sentence Frames</button>
        <button className={tab === 'rights' ? 'active' : ''} onClick={() => setTab('rights')}>Know Your Rights</button>
      </div>

      {tab === 'story' && (
        <div className="panel">
          <label>Main Symptom:</label>
          <div className="input-row">
            <input value={symptom} onChange={e => setSymptom(e.target.value)} />
            <button onClick={() => startListening(setSymptom)}>🎤</button>
          </div>

          <label>What the doctor said:</label>
          <div className="input-row">
            <input value={dismissal} onChange={e => setDismissal(e.target.value)} />
            <button onClick={() => startListening(setDismissal)}>🎤</button>
          </div>

          <label>What you said or wish you said:</label>
          <div className="input-row">
            <input value={action} onChange={e => setAction(e.target.value)} />
            <button onClick={() => startListening(setAction)}>🎤</button>
          </div>

          <button className="generate" onClick={() => handleSubmit()}>🌸 Generate Story</button>

          {listening && (
            <div className="listening-indicator">🎙️ Listening...</div>
          )}

          <ProgressBar progress={progress} isLoading={isLoading} />

          <hr />
          <strong>AI Response:</strong>
          <p className="response-box">{response}</p>
        </div>
      )}

      {tab === 'frames' && (
        <ul className="panel">
          <li>I know my body. These symptoms are real, even if tests don’t show it yet.</li>
          <li>Can we document this conversation and include it in my chart?</li>
          <li>I’d like to explore neurological causes. Could we consider that?</li>
          <li>I am requesting a second opinion or referral to a neurologist.</li>
          <li>I’ve read that delayed diagnosis can cause harm. I want to be proactive.</li>
        </ul>
      )}

      {tab === 'rights' && (
        <ul className="panel">
          <li><strong>Affordable Care Act</strong> (42 U.S.C. § 18001): Guarantees the right to appeal denied care and access affordable, quality treatment.</li>
          <li><strong>HIPAA</strong> (45 CFR § 164.524): Grants you access to your full medical records at any time.</li>
          <li><strong>Civil Rights Act</strong> (42 U.S. Code § 2000d): Protects against discrimination based on race, gender, or other identities.</li>
          <li><strong>Parity Law</strong>: Ensures mental and physical conditions receive equal care and coverage.</li>
          <li><strong>The Joint Commission</strong>: Establishes standards for patient safety and advocacy nationwide.</li>
        </ul>
      )}
    </div>
  );
}

export default App;
