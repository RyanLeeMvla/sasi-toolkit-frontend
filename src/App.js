
import React, { useState, useEffect, useCallback } from 'react';
import './ToolkitStyle.css';
import ProgressBar from './ProgressBar';
import io from 'socket.io-client';
import supabase from './supabaseClient';
import Login from './Login';

// Central API base URL for all backend requests
const API = 'https://sasi-toolkit.onrender.com';

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
  const [timeline, setTimeline] = useState([]);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newTime, setNewTime] = useState(new Date().toISOString().slice(0, 16)); // 'YYYY-MM-DDTHH:mm'
  // Timeline edit state
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editTime, setEditTime] = useState('');

  // Expose supabase client for debugging
  useEffect(() => {
    window.supabase = supabase;
  }, []);

  // Add a new timeline event
  const addTimelineEvent = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    await fetch('https://sasi-toolkit.onrender.com/timeline', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        title: newTitle,
        description: newDesc,
        event_time: newTime
      })
    });

    setNewTitle('');
    setNewDesc('');
    setNewTime(new Date().toISOString().slice(0, 16));
    await fetchTimeline();
  };


  // Listen for physical button press
  useEffect(() => {
    socket.on('buttonPress', () => {
      console.log("🟢 Physical button pressed!");
      handleFullVoiceInput();
    });
    return () => socket.off('buttonPress');
    // eslint-disable-next-line
  }, []);

  // Get current user from Supabase
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });
    const socket = io('https://sasi-toolkit.onrender.com');
    socket.on('transcription_result', data => {
      setSymptom(data.symptom);
      setDismissal(data.dismissal);
      setAction(data.action);
      handleSubmit(data.symptom, data.dismissal);
    });
    return () => socket.disconnect();
  }, []);

  // Listen for ESP32 button press and send JWT token
  useEffect(() => {
    socket.on('buttonPress', async () => {
      console.log("🔐 ESP32 asked for token");
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (token) {
        socket.emit('userToken', token);  // Send token back to ESP32
        console.log("📤 Sent token to ESP32");
      }
    });
    return () => {
      socket.off('buttonPress');
    };
  }, []);

  // Fetch timeline helper (useCallback for stable reference)
  const fetchTimeline = useCallback(async () => {
    const { data, error } = await supabase
      .from('timeline_events')
      .select('*');
    if (!error && data) {
      const sorted = [...data].sort((a, b) => new Date(a.event_time) - new Date(b.event_time));
      setTimeline(sorted);
    }
  }, []);

  useEffect(() => {
    if (user) fetchTimeline();
  }, [user, fetchTimeline]);

  // Timeline save edit (state-based refresh)
const saveEdit = async (id) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error('Not authenticated');

    const res = await fetch(`https://sasi-toolkit.onrender.com/timeline/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        title: editTitle,
        description: editDesc,
        event_time: editTime
      })
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      console.error('PUT failed:', json);
      throw new Error(json.error || 'Unknown error');
    }

    setEditingId(null);
    await fetchTimeline();
  } catch (err) {
    console.error('Error saving edit:', err);
    alert(`Save failed: ${err.message}`);
  }
};

  // Timeline delete (state-based refresh)
const deleteTimelineEvent = async (id) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    const res = await fetch(`${API}/timeline/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    const text = await res.text();
    console.log('DELETE status', res.status, 'response:', text);
    if (!res.ok) throw new Error(text);
    await fetchTimeline();
  } catch (err) {
    console.error(err);
    alert(`Delete failed: ${err.message}`);
  }
};



  if (!user) return <Login setUser={setUser} />;

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
  const handleFullVoiceInput = async () => {
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

      const lowerTranscript = fullTranscript.toLowerCase();
      // Check for timeline trigger
      const shouldAddToTimeline = /add (this|that|it)? ?to (my )?timeline/.test(lowerTranscript);

      try {
        const { data } = await supabase.auth.getSession();
        const accessToken = data?.session?.access_token;

        // Run structured extraction
        const res = await fetch('https://sasi-toolkit.onrender.com/extract', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken && { 'Authorization': `Bearer ${accessToken}` })
          },
          body: JSON.stringify({ transcript: fullTranscript })
        });

        const dataRes = await res.json();

        setSymptom(dataRes.symptom || '');
        setDismissal(dataRes.dismissal || '');
        setAction(dataRes.action || '');

        // Auto-run story generation
        handleSubmit(dataRes.symptom, dataRes.dismissal);

        // ✅ If "add to timeline" phrase is detected
        if (shouldAddToTimeline) {
          await fetch('https://sasi-toolkit.onrender.com/timeline', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(accessToken && { 'Authorization': `Bearer ${accessToken}` })
            },
            body: JSON.stringify({
              title: 'Voice Log',
              description: fullTranscript
            })
          });
          console.log("🕒 Timeline event created via voice.");
        }

        console.log("✅ Received structured data from backend:", dataRes);
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
      // Get JWT access token from Supabase
      const { data } = await supabase.auth.getSession();
      const accessToken = data?.session?.access_token;

      const res = await fetch('https://sasi-toolkit.onrender.com/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken && { 'Authorization': `Bearer ${accessToken}` })
        },
        body: JSON.stringify({ symptom: usedSymptom, dismissal: usedDismissal })
      });

      const dataRes = await res.json();
      clearInterval(interval);
      setProgress(100);
      await new Promise(res => setTimeout(res, 300));
      setIsLoading(false);
      setResponse(`💬 AI Sentence:\n${dataRes.message}`);
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
      </div>

      <div className="tabs">
        <button className={tab === 'story' ? 'active' : ''} onClick={() => setTab('story')}>Build Your Story</button>
        <button className={tab === 'frames' ? 'active' : ''} onClick={() => setTab('frames')}>Sentence Frames</button>
        <button className={tab === 'rights' ? 'active' : ''} onClick={() => setTab('rights')}>Know Your Rights</button>
        <button className={tab === 'timeline' ? 'active' : ''} onClick={() => setTab('timeline')}>📅 Timeline</button>
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

      {tab === 'timeline' && (
        <div className="panel">
          <h2>Add a Timeline Event</h2>
          <input
            placeholder="Title"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            style={{ width: '100%', marginBottom: '0.5rem' }}
          />
          <textarea
            placeholder="Description"
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            style={{ width: '100%', marginBottom: '0.5rem' }}
          />
          <input
            type="datetime-local"
            value={newTime}
            onChange={e => setNewTime(e.target.value)}
            style={{ width: '100%', marginBottom: '0.5rem' }}
          />
          <button className="generate" onClick={addTimelineEvent}>➕ Add to Timeline</button>

          <hr />

          <h2>Your Timeline</h2>
          <div className="timeline-container">
            <div className="timeline-line"></div>
            {timeline.map(event => (
              <div className="timeline-item" key={event.id}>
                <div className="timeline-dot"></div>
                {editingId === event.id ? (
                  <div className="timeline-card">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                    />
                    <input
                      type="datetime-local"
                      value={editTime}
                      onChange={e => setEditTime(e.target.value)}
                    />
                    <textarea
                      value={editDesc}
                      onChange={e => setEditDesc(e.target.value)}
                    />
                    <div className="button-group">
                      <button onClick={() => saveEdit(event.id)}>✅ Save</button>
                      <button onClick={() => setEditingId(null)}>❌ Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="timeline-card">
                    <strong>{event.title}</strong>
                    <div className="timeline-time">
                      {new Date(event.event_time).toLocaleString()}
                    </div>
                    <p>{event.description}</p>
                    <div className="button-group">
                      <button onClick={() => {
                        setEditingId(event.id);
                        setEditTitle(event.title);
                        setEditDesc(event.description);
                        setEditTime(new Date(event.event_time).toISOString().slice(0,16));
                      }}>✏️ Edit</button>
                      <button onClick={() => deleteTimelineEvent(event.id)}>🗑️ Delete</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        className="signout-button"
        onClick={async () => {
          await supabase.auth.signOut();
          setUser(null);
        }}
      >
        🔒 Sign Out
      </button>
    </div>
  );
}

export default App;