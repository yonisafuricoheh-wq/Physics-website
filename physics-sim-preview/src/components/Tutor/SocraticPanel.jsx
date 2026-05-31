import React, { useRef, useEffect, useCallback, useState } from 'react';
import useStore from '../../store/simulationStore';
import { createVisionEngine, extractHighlightedForces } from '../../engine/visionEngine';

function buildBlueprintSummary(blueprint, simTime, objectStates) {
  if (!blueprint) return 'No simulation loaded.';
  const lines = [
    `Problem: ${blueprint.description}`,
    `Type: ${blueprint.problem_type}`,
    `Time elapsed: ${simTime.toFixed(2)} s`,
  ];
  blueprint.objects.forEach(obj => {
    const st = objectStates[obj.id];
    lines.push(`Object "${obj.label}" (${obj.mass} kg): pos=(${st ? st.position.x.toFixed(2) : obj.position.x}, ${st ? st.position.y.toFixed(2) : obj.position.y}) m, speed=${st ? st.speed.toFixed(2) : 0} m/s`);
  });
  blueprint.forces.forEach(f => {
    lines.push(`Force ${f.label}: ${f.magnitude?.toFixed(2)} N @ ${f.angle_degrees}°`);
  });
  if (blueprint.known_results?.acceleration != null) {
    lines.push(`Expected acceleration: ${blueprint.known_results.acceleration} m/s²`);
  }
  return lines.join('\n');
}

function formatContent(text) {
  // Convert **bold** → highlight spans, keep rest as text
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const inner = part.slice(2, -2);
      return <span key={i} className="force-highlight">{inner}</span>;
    }
    return part;
  });
}

const STARTER_QUESTIONS = {
  projectile: [
    'What is the velocity at the highest point?',
    'How long does the object stay in the air?',
    'At what height do the two objects meet?',
    'What is the acceleration at the peak?',
  ],
  inclined_plane: [
    'What forces act on the block?',
    'How does friction affect the acceleration?',
    'How do I find the normal force on a slope?',
    'What is the net force along the ramp?',
  ],
  pulley: [
    'Why do both objects have the same acceleration?',
    'How do I find the tension in the rope?',
    'What is the net force on the system?',
    'When does object B hit the floor?',
  ],
  collision: [
    'Is momentum conserved here?',
    'What is the velocity after the collision?',
    'How much kinetic energy is lost?',
    'What type of collision is this?',
  ],
  spring: [
    'What is the spring constant?',
    'Where is the equilibrium position?',
    'How does amplitude affect the period?',
    'What is the maximum velocity?',
  ],
  default: [
    'What forces act on the object?',
    'How do I find the acceleration?',
    'What does Newton\'s second law say here?',
    'How is energy conserved in this problem?',
  ],
};

export default function SocraticPanel() {
  const [input, setInput] = useState('');
  const endRef   = useRef(null);
  const inputRef = useRef(null);

  const geminiApiKey  = useStore(s => s.geminiApiKey);
  const modelId       = useStore(s => s.selectedModelId);
  const blueprint     = useStore(s => s.blueprint);
  const simTime       = useStore(s => s.simTime);
  const objectStates  = useStore(s => s.objectStates);
  const tutorHistory  = useStore(s => s.tutorHistory);
  const tutorLoading  = useStore(s => s.tutorLoading);
  const addTutorMsg   = useStore(s => s.addTutorMsg);
  const setTutorLoading = useStore(s => s.setTutorLoading);
  const setHighlightedForces = useStore(s => s.setHighlightedForces);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [tutorHistory, tutorLoading]);

  const sendMessage = useCallback(async (text) => {
    const q = text.trim();
    if (!q || !blueprint || !geminiApiKey || tutorLoading) return;

    addTutorMsg('user', q);
    setTutorLoading(true);
    setInput('');

    try {
      const vision = createVisionEngine(geminiApiKey, modelId);
      const summary = buildBlueprintSummary(blueprint, simTime, objectStates);

      // Only pass last 6 messages as history (to avoid token overflow)
      const recentHistory = tutorHistory.slice(-6);
      const response = await vision.chat(q, summary, recentHistory);

      addTutorMsg('assistant', response);

      // Sync force highlights
      const forceLabels = extractHighlightedForces(response);
      if (forceLabels.length) {
        setHighlightedForces(forceLabels);
        setTimeout(() => setHighlightedForces([]), 4000);
      }
    } catch (err) {
      addTutorMsg('assistant', `Error: ${err.message}`);
    } finally {
      setTutorLoading(false);
    }
  }, [blueprint, geminiApiKey, modelId, tutorLoading, tutorHistory, simTime, objectStates, addTutorMsg, setTutorLoading, setHighlightedForces]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="tutor-panel">
      <div className="tutor-header">
        <span>⚗ Socratic Tutor</span>
        {geminiApiKey ? (
          <span className="badge green">{modelId}</span>
        ) : (
          <span className="badge red">API key needed</span>
        )}
      </div>

      {/* Message list */}
      <div className="tutor-messages">
        {tutorHistory.length === 0 && (
          <div className="tutor-welcome">
            <p>Ask me anything about this simulation. I'll guide you with questions!</p>
            <p style={{ fontSize:11, opacity:.6 }}>Forces highlighted in bold will <span className="force-highlight">glow</span> on the canvas.</p>
          </div>
        )}

        {tutorHistory.map(msg => (
          <div key={msg.id} className={`tutor-msg ${msg.role}`}>
            <div className="msg-role">{msg.role === 'user' ? 'You' : 'Tutor'}</div>
            <div className="msg-body">{formatContent(msg.content)}</div>
          </div>
        ))}

        {tutorLoading && (
          <div className="tutor-msg assistant">
            <div className="msg-role">Tutor</div>
            <div className="msg-body typing-dots"><span /><span /><span /></div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Starter questions */}
      {tutorHistory.length === 0 && blueprint && (
        <div className="starters">
          {(STARTER_QUESTIONS[blueprint.problem_type] || STARTER_QUESTIONS.default).map(q => (
            <button key={q} className="starter-btn" onClick={() => sendMessage(q)}>{q}</button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="tutor-input-area">
        <textarea
          ref={inputRef}
          className="tutor-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={blueprint ? 'Ask about forces, motion, energy…' : 'Load a problem first'}
          disabled={!blueprint || !geminiApiKey || tutorLoading}
          rows={2}
        />
        <button
          className="send-btn"
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || !blueprint || !geminiApiKey || tutorLoading}
        >
          ↑
        </button>
      </div>
    </div>
  );
}
