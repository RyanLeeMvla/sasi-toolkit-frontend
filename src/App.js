
import React, { useState, useEffect, useCallback } from 'react';
import './ToolkitStyle.css';
import ProgressBar from './ProgressBar';
import io from 'socket.io-client';
import supabase from './supabaseClient';
import Login from './Login';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Central API base URL for all backend requests
const API = 'https://sasi-toolkit.onrender.com';

// ✅ Point to Render backend (adjust this if you set up an environment variable later)
const socket = io('https://sasi-toolkit.onrender.com');

function App() {
  // --- your existing state ---
  const [tab, setTab] = useState('story');
  const [symptom, setSymptom] = useState('');
  const [dismissal, setDismissal] = useState('');
  const [action, setAction] = useState('');
  const [progress, setProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [user, setUser] = useState(null);
  const [response, setResponse] = useState('Your AI-generated response will appear here.');
  const [summary, setSummary] = useState('');
  const [timeline, setTimeline] = useState([]);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newTime, setNewTime] = useState(new Date().toISOString().slice(0, 16)); // 'YYYY-MM-DDTHH:mm'
  // Timeline edit state
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editTime, setEditTime] = useState('');
  
  // Voice timeline message state (must be declared with other hooks, not inside a conditional or after return)
  const [voiceTimelineMsg, setVoiceTimelineMsg] = useState("");

  // PDF Exporter for Timeline (after timeline state is declared)
  const exportTimelineAsPDF = () => {
    if (!timeline.length) {
      alert('No events to export.');
      return;
    }

    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('🗓️ Patient Timeline', 14, 22);

    const head = [['Date', 'Title', 'Description']];
    const body = timeline.map(e => [
      new Date(e.event_time).toLocaleString(),
      e.title,
      e.description
    ]);

    autoTable(doc, {
      head,
      body,
      startY: 30,
      styles: { cellWidth: 'wrap' },
      headStyles: { fillColor: [41, 128, 185] },
      margin: { left: 14, right: 14 }
    });

    doc.save('timeline.pdf');
  };



  // --- Move all helper functions above useEffect hooks ---

  // 1️⃣ Define handleSubmit before any helper that calls it
  const handleSubmit = async (customSymptom, customDismissal) => {
    const usedSymptom = customSymptom !== undefined ? customSymptom : symptom;
    const usedDismissal = customDismissal !== undefined ? customDismissal : dismissal;

    // 1️⃣ Pull in the timeline events as context
    const { data: timelineEvents } = await supabase
      .from('timeline_events')
      .select('title,description,event_time')
      .order('event_time', { ascending: true });

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
        body: JSON.stringify({
          symptom: usedSymptom,
          dismissal: usedDismissal,
          timeline: timelineEvents
        })
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

  // 2️⃣ Now define handleFullVoiceInput after handleSubmit
  const handleFullVoiceInput = async () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return alert("Speech recognition not supported.");

    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';
    setListening(true);

    rec.onresult = async (e) => {
      const transcript = e.results[0][0].transcript.trim();
      console.log("🎤 Transcript:", transcript);

      // 1) Extract + summary
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const extractRes = await fetch(`${API}/extract`, { /*…*/ });
      const { symptom, dismissal, action, summary } = await extractRes.json();
      setSymptom(symptom); setDismissal(dismissal); setAction(action); setSummary(summary);

      // 2) Classify via AI
      console.log("🔍 Asking AI if we should log this…");
      const classifyRes = await fetch(`${API}/classify-timeline`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json', ...(token && {Authorization:`Bearer ${token}`}) },
        body: JSON.stringify({ transcript, summary })
      });
      const { addToTimeline } = await classifyRes.json();
      console.log("🤖 AI addToTimeline:", addToTimeline);

      if (addToTimeline) {
        console.log("🕒 AI decided to log this event → generating title…");
        // generate title
        const titleRes = await fetch(`${API}/timeline/title`, { /*…*/ });
        const { title } = await titleRes.json();
        console.log("✏️ Title from AI:", title);

        // insert into timeline
        const insertRes = await fetch(`${API}/timeline`, { /*…*/ });
        const insertJson = await insertRes.json();
        if (insertRes.ok && insertJson.success) {
          console.log("✅ Timeline event created via AI trigger:", insertJson.id);
          setVoiceTimelineMsg(`✅ Event added: "${title}"`);
          await fetchTimeline();
        } else {
          console.error("❌ Insert failed:", insertJson);
          setVoiceTimelineMsg(`❌ Insert failed: ${insertJson.error}`);
        }
      } else {
        console.log("ℹ️ AI decided NOT to log.");
        setVoiceTimelineMsg('ℹ️ AI decided not to log this event.');
      }

      // 3) Always generate story
      handleSubmit(symptom, dismissal);
      setListening(false);
    };

    rec.onerror = () => setListening(false);
    rec.start();
  };


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

  // Expose supabase client for debugging
  useEffect(() => {
    window.supabase = supabase;
  }, []);

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

  useEffect(() => {
    if (user) fetchTimeline();
  }, [user, fetchTimeline]);



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



  // ...existing code...


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

          {listening && <div className="listening-indicator">🎙️ Listening...</div>}

          {/* ───────── Summary field ───────── */}
          <label>Transcript Summary:</label>
          <textarea
            readOnly
            value={summary}
            className="response-box"
            style={{ width: '100%', height: '4rem', margin: '1rem 0' }}
          />

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

          <button onClick={exportTimelineAsPDF}>📄 Download PDF</button>

          {voiceTimelineMsg && (
            <div style={{margin:'1rem 0', color:'#2d7'}}> {voiceTimelineMsg} </div>
          )}

          <hr />

          <h2>Your Timeline</h2>
          <div className="timeline-scroll">
            <div className="timeline-track">
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
                      {/* use the AI summary */}
                      <p>{event.description}</p>
                      {/* raw transcript underneath */}
                      {event.transcript && (
                        <p style={{fontStyle:'italic', marginTop:'0.5rem', color:'#555'}}>
                          {event.transcript}
                        </p>
                      )}
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