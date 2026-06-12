export const styles = `
.gl-launcher {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: #0B0E14;
  border: 1px solid #1E2530;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 24px rgba(0,0,0,0.4);
  z-index: 999999;
  transition: transform 0.15s ease;
}
.gl-launcher:hover { transform: scale(1.06); }
.gl-launcher .gl-dot {
  width: 10px; height: 10px; border-radius: 50%;
  background: #5EE6A8;
  animation: gl-pulse 1.6s ease-in-out infinite;
}
@keyframes gl-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }

.gl-panel {
  position: fixed;
  bottom: 88px;
  right: 20px;
  width: 360px;
  max-width: calc(100vw - 32px);
  height: 520px;
  max-height: calc(100vh - 120px);
  background: #0B0E14;
  border: 1px solid #1E2530;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: 'Inter', -apple-system, system-ui, sans-serif;
  box-shadow: 0 12px 48px rgba(0,0,0,0.5);
  z-index: 999999;
}
.gl-panel.gl-hidden { display: none; }

.gl-header {
  padding: 14px 16px;
  border-bottom: 1px solid #1E2530;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.gl-header-title {
  font-family: 'Spline Sans Mono', monospace;
  font-size: 11px;
  letter-spacing: 0.25em;
  text-transform: uppercase;
  color: #8893A6;
  display: flex;
  align-items: center;
  gap: 8px;
}
.gl-header-title .gl-dot {
  width: 8px; height: 8px; border-radius: 50%; background: #5EE6A8;
  animation: gl-pulse 1.6s ease-in-out infinite;
}
.gl-close {
  background: none; border: none; color: #8893A6; cursor: pointer;
  font-size: 18px; line-height: 1; padding: 4px;
}
.gl-close:hover { color: #E9EDF3; }

.gl-status {
  padding: 6px 16px;
  font-family: 'Spline Sans Mono', monospace;
  font-size: 10px;
  color: #8893A6;
  border-bottom: 1px solid #1E2530;
}

.gl-messages {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.gl-msg {
  max-width: 80%;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.4;
  word-wrap: break-word;
  white-space: pre-wrap;
  color: #E9EDF3;
  border: 1px solid #1E2530;
}
.gl-msg-client {
  align-self: flex-end;
  background: rgba(94,230,168,0.10);
  border-color: rgba(94,230,168,0.3);
}
.gl-msg-operator {
  align-self: flex-start;
  background: #11151D;
}
.gl-msg-time {
  font-family: 'Spline Sans Mono', monospace;
  font-size: 9px;
  color: #8893A6;
  margin-top: 4px;
}
.gl-msg a { color: #5EE6A8; text-decoration: underline; }

.gl-typing {
  font-size: 11px;
  color: #8893A6;
  padding: 0 14px 6px;
  font-style: italic;
}

.gl-input-row {
  border-top: 1px solid #1E2530;
  padding: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.gl-input {
  flex: 1;
  background: #11151D;
  border: 1px solid #1E2530;
  border-radius: 6px;
  color: #E9EDF3;
  padding: 8px 10px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
}
.gl-input:focus { border-color: #5EE6A8; }
.gl-send, .gl-attach {
  background: none;
  border: none;
  cursor: pointer;
  color: #8893A6;
  padding: 6px;
}
.gl-send {
  background: #5EE6A8;
  color: #0B0E14;
  border-radius: 6px;
  font-family: 'Spline Sans Mono', monospace;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 8px 12px;
}
.gl-send:disabled { opacity: 0.4; cursor: default; }
.gl-attach:hover { color: #5EE6A8; }

.gl-footer {
  padding: 6px 14px 10px;
  font-family: 'Spline Sans Mono', monospace;
  font-size: 9px;
  color: #8893A6;
  text-align: center;
  letter-spacing: 0.05em;
}
`;
