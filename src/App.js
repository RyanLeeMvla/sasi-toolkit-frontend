// src/App.js
import React, { useState } from 'react';
import './ToolkitStyle.css';  // your custom styles
import ProgressBar from './ProgressBar'; // assuming it's in src/


function App() {
  const [tab, setTab] = useState('story');
  const [symptom, setSymptom] = useState('');
  const [dismissal, setDismissal] = useState('');
  const [action, setAction] = useState('');
  const [progress, setProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [listening, setListening] = useState(false);


  const startListening = (fieldSetter) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    setListening(true); // 👂 Start listening UI

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      fieldSetter(transcript);
    };

    recognition.onend = () => {
      setListening(false); // 🔇 Stop listening UI when finished
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setListening(false);
    };

    recognition.start();
  };



  const [response, setResponse] = useState('Your AI-generated response will appear here.');

  const handleSubmit = async () => {
    setIsLoading(true);
    setResponse('Generating story…');
    setProgress(0);

    await new Promise(res => setTimeout(res, 300));

    let progressValue = 0;
    const interval = setInterval(() => {
      progressValue += 5;
      if (progressValue < 90) {
        setProgress(progressValue);
      } else {
        clearInterval(interval);
      }
    }, 300);

    try {
      const res = await fetch('https://sasi-toolkit.onrender.com/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symptom, dismissal })
      });
      const data = await res.json();

      clearInterval(interval);
      setProgress(100);
      await new Promise(res => setTimeout(res, 300));
      setIsLoading(false); // 🔥 stop shimmer here

      const story = `💬 AI Response:\n\n${data.message}`;
      setResponse(story);
    } catch (err) {
      clearInterval(interval);
      setProgress(0);
      setIsLoading(false); // 🔥 stop shimmer here
      setResponse('Error: ' + err.message);
    }
  };





  return (
    <div className="App">
      <h1>🧠 Storytelling Toolkit for Patients</h1>

      <div className="tabs">
        <button
          className={tab === 'story' ? 'active' : ''}
          onClick={() => setTab('story')}
        >
          Build Your Story
        </button>
        <button
          className={tab === 'frames' ? 'active' : ''}
          onClick={() => setTab('frames')}
        >
          Sentence Frames
        </button>
        <button
          className={tab === 'rights' ? 'active' : ''}
          onClick={() => setTab('rights')}
        >
          Know Your Rights
        </button>
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


          <button className="generate" onClick={handleSubmit}>
            🌸 Generate Story
          </button>

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
          <li>
            <strong>Affordable Care Act</strong> (42 U.S.C. § 18001): Guarantees the right to appeal denied care and access affordable, quality treatment.
          </li>
          <li>
            <strong>HIPAA</strong> (45 CFR § 164.524): Grants you access to your full medical records at any time.
          </li>
          <li>
            <strong>Civil Rights Act</strong> (42 U.S. Code § 2000d): Protects against discrimination based on race, gender, or other identities.
          </li>
          <li>
            <strong>Parity Law</strong>: Ensures mental and physical conditions receive equal care and coverage.
          </li>
          <li>
            <strong>The Joint Commission</strong>: Establishes standards for patient safety and advocacy nationwide.
          </li>
        </ul>
      )}
    </div>
  );
}

export default App;
